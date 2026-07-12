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
	eventChan     chan *models.Event
	wg            sync.WaitGroup
	ctx           context.Context
	cancel        context.CancelFunc
	pool          *sync.Pool
}

func NewEngine(repo repository.ClickHouseRepo, batchSize int, flushInterval time.Duration) *Engine {
	ctx, cancel := context.WithCancel(context.Background())
	return &Engine{
		repo:          repo,
		batchSize:     batchSize,
		flushInterval: flushInterval,
		eventChan:     make(chan *models.Event, batchSize*10),
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
	batch := *batchPtr

	flush := func() {
		if len(batch) > 0 {
			err := e.repo.InsertBatch(e.ctx, batch)
			if err != nil {
				log.Printf("Failed to insert batch: %v", err)
			}
			// Clear the slice but keep capacity
			batch = batch[:0]
		}
	}

	for {
		select {
		case <-e.ctx.Done():
			flush()
			// Return slice to pool
			*batchPtr = batch
			e.pool.Put(batchPtr)
			return
		case event := <-e.eventChan:
			batch = append(batch, event)
			if len(batch) >= e.batchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (e *Engine) AddEvent(event *models.Event) {
	select {
	case e.eventChan <- event:
	case <-e.ctx.Done():
	}
}

func (e *Engine) Stop() {
	e.cancel()
	e.wg.Wait()
	close(e.eventChan)
}
