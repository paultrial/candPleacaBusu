import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { BusScheduleService, DayType, RouteSchedule } from './bus-schedule.service';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrls: ['./app.less']
})
export class App implements OnInit, OnDestroy {
  private readonly scheduleService = inject(BusScheduleService);
  private timerId: number | null = null;

  protected readonly now = signal(new Date());
  protected readonly combinedDepartures = signal<CombinedDeparture[]>([]);
  protected readonly routes = signal<RouteCard[]>([
    {
      id: '50-dus',
      lineLabel: '50',
      routeLabel: 'Solomon - Camera de Comert',
      url: 'https://www.ratbv.ro/afisaje/50-dus/line_50_9_cl2_ro.html',
      state: 'loading'
    },
    {
      id: '4-intors',
      lineLabel: '4',
      routeLabel: 'Tocile - Terminal Gara',
      url: 'https://www.ratbv.ro/afisaje/4-intors/line_4_3_cl1_ro.html',
      state: 'loading'
    },
    {
      id: '52-intors',
      lineLabel: '52',
      routeLabel: 'Tocile - Roman (Panselelor)',
      url: 'https://www.ratbv.ro/afisaje/52-intors/line_52_3_cl1_ro.html',
      state: 'loading'
    }
  ]);

  ngOnInit(): void {
    this.refreshAll();
    this.timerId = window.setInterval(() => {
      this.now.set(new Date());
      this.updateDepartures();
    }, 10000);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
    }
  }

  protected formatTime(value: Date): string {
    return new Intl.DateTimeFormat('ro-RO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(value);
  }

  protected formatDate(value: Date): string {
    return new Intl.DateTimeFormat('ro-RO', {
      weekday: 'long',
      day: '2-digit',
      month: 'short'
    }).format(value);
  }

  protected formatDelta(minutes: number): string {
    if (minutes <= 0) {
      return 'now';
    }
    return `${minutes} min`;
  }

  private async refreshAll(): Promise<void> {
    const configs = this.routes();
    this.routes.set(
      configs.map((route) => ({
        ...route,
        state: 'loading',
        error: undefined
      }))
    );

    await Promise.all(configs.map((route) => this.loadRoute(route)));
    this.updateDepartures();
  }

  private async loadRoute(route: RouteCard): Promise<void> {
    try {
      const data = await this.scheduleService.loadSchedule(route.url);
      this.routes.update((routes) =>
        routes.map((entry) =>
          entry.id === route.id
            ? {
                ...entry,
                state: 'ready',
                data,
                error: undefined
              }
            : entry
        )
      );
      this.updateDepartures();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load schedule';
      this.routes.update((routes) =>
        routes.map((entry) =>
          entry.id === route.id
            ? {
                ...entry,
                state: 'error',
                error: message
              }
            : entry
        )
      );
    }
  }

  private updateDepartures(): void {
    const now = this.now();
    const combined: CombinedDeparture[] = [];
    const updatedRoutes = this.routes().map((entry) => {
      if (!entry.data) {
        return entry;
      }
      const nextDepartures = this.computeNextDepartures(entry.data, now);
      const lineLabel = entry.data.details.line || entry.lineLabel;

      for (const departure of nextDepartures) {
        combined.push({
          ...departure,
          lineLabel,
          viaProxy: entry.data.viaProxy
        });
      }

      return {
        ...entry,
        nextDepartures,
        activeDayType: this.getDayType(now)
      };
    });

    const sorted = combined
      .sort((a, b) => a.time.getTime() - b.time.getTime())
      .slice(0, 5);

    this.routes.set(updatedRoutes);
    this.combinedDepartures.set(sorted);
  }

  private computeNextDepartures(route: RouteSchedule, now: Date): NextDeparture[] {
    const results: NextDeparture[] = [];
    const base = new Date(now);
    base.setSeconds(0, 0);

    for (let offset = 0; offset < 3 && results.length < 3; offset += 1) {
      const target = new Date(base);
      target.setDate(base.getDate() + offset);
      target.setHours(0, 0, 0, 0);

      const dayType = this.getDayType(target);
      const schedule = route.schedules[dayType] ?? [];
      if (schedule.length === 0) {
        continue;
      }

      const currentMinutes = offset === 0 ? base.getHours() * 60 + base.getMinutes() : -1;
      for (const minutes of schedule) {
        if (offset === 0 && minutes < currentMinutes) {
          continue;
        }
        const departure = new Date(target);
        departure.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
        const diffMinutes = Math.max(0, Math.ceil((departure.getTime() - base.getTime()) / 60000));
        results.push({
          time: departure,
          minutesAway: diffMinutes,
          dayOffset: offset,
          dayType
        });
        if (results.length >= 3) {
          break;
        }
      }
    }

    return results;
  }

  private getDayType(date: Date): DayType {
    const day = date.getDay();
    if (day === 0) {
      return 'sunday';
    }
    if (day === 6) {
      return 'saturday';
    }
    return 'weekday';
  }
}

type LoadState = 'loading' | 'ready' | 'error';

interface NextDeparture {
  time: Date;
  minutesAway: number;
  dayOffset: number;
  dayType: DayType;
}

interface RouteCard {
  id: string;
  lineLabel: string;
  routeLabel: string;
  url: string;
  state: LoadState;
  data?: RouteSchedule;
  error?: string;
  nextDepartures?: NextDeparture[];
  activeDayType?: DayType;
}

interface CombinedDeparture extends NextDeparture {
  lineLabel: string;
  viaProxy: boolean;
}
