import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { BusScheduleService } from './bus-schedule.service';

class MockBusScheduleService {
  async loadSchedule() {
    return {
      details: { line: 'X', route: 'Test Route', station: 'Test Stop' },
      schedules: { weekday: [], saturday: [], sunday: [] },
      sourceUrl: 'test',
      viaProxy: false
    };
  }
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: BusScheduleService, useClass: MockBusScheduleService }]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Next bus departures');
  });
});
