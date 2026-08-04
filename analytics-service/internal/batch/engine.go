package batch

import (
	"context"
	"log"
	"sync"
	"time"

	"sentinel/analytics-service/internal/models"
	"sentinel/analytics-service/internal/repository"
)

type Engine struct {
	repo          repository.ClickHouseRepo
	batchSize     int
	flushInterval time.Duration
	eventChan     chan queuedEvent
	wg            sync.WaitGroup
	ctx           context.Context
	cancel        context.CancelFunc
	pool          *sync.Pool
	onEvent       func(*models.Event)
}

type queuedEvent struct {
	event *models.Event
	done  chan error
}

func (e *Engine) SetEventHandler(handler func(*models.Event)) {
	e.onEvent = handler
}

func NewEngine(repo repository.ClickHouseRepo, batchSize int, flushInterval time.Duration) *Engine {
	ctx, cancel := context.WithCancel(context.Background())
	return &Engine{
		repo:          repo,
		batchSize:     batchSize,
		flushInterval: flushInterval,
		eventChan:     make(chan queuedEvent, batchSize*10),
		ctx:           ctx,
		cancel:        cancel,
		pool: &sync.Pool{
			New: func() interface{} {
				// Pre-allocate a slice of the required batch size to prevent memory leaks/fragmentation
				b := make([]*models.Event, 0, batchSize)
				return &b
			},
		},
	}
}

func (e *Engine) Start(workers int) {
	for i := 0; i < workers; i++ {
		e.wg.Add(1)
		go e.worker()
	}
}

func (e *Engine) worker() {
	defer e.wg.Done()

	ticker := time.NewTicker(e.flushInterval)
	defer ticker.Stop()

	batchPtr := e.pool.Get().(*[]*models.Event)
	batch := make([]queuedEvent, 0, cap(*batchPtr))

	flush := func() {
		if len(batch) > 0 {
			events := (*batchPtr)[:0]
			for _, item := range batch {
				events = append(events, item.event)
			}
			flushCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			var err error
			for attempt := 0; attempt < 3; attempt++ {
				err = e.repo.InsertBatch(flushCtx, events)
				if err == nil {
					break
				}
				time.Sleep(time.Duration(attempt+1) * 250 * time.Millisecond)
			}
			cancel()
			if err != nil {
				log.Printf("failed to insert analytics batch after retries: %v", err)
				for _, item := range batch {
					item.done <- err
					close(item.done)
				}
				batch = batch[:0]
				return
			}
			for _, item := range batch {
				item.done <- nil
				close(item.done)
				if e.onEvent != nil {
					e.onEvent(item.event)
				}
			}
			batch = batch[:0]
		}
	}

	for {
		select {
		case item, ok := <-e.eventChan:
			if !ok {
				flush()
				*batchPtr = (*batchPtr)[:0]
				e.pool.Put(batchPtr)
				return
			}
			batch = append(batch, item)
			if len(batch) >= e.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (e *Engine) AddEvent(ctx context.Context, event *models.Event) error {
	done := make(chan error, 1)
	select {
	case e.eventChan <- queuedEvent{event: event, done: done}:
	case <-e.ctx.Done():
		return context.Canceled
	case <-ctx.Done():
		return ctx.Err()
	}

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (e *Engine) Stop() {
	close(e.eventChan)
	e.wg.Wait()
	e.cancel()
}
