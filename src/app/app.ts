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
  private scheduleRefreshId: number | null = null;

  protected readonly busStops = BUS_STOPS;
  protected readonly selectedStopId = signal(BUS_STOPS[0]?.id ?? '');
  protected readonly now = signal(new Date());
  protected readonly combinedDepartures = signal<CombinedDeparture[]>([]);
  protected readonly routes = signal<RouteCard[]>(this.buildRoutes(this.selectedStopId()));

  ngOnInit(): void {
    this.refreshAll();
    this.timerId = window.setInterval(() => {
      this.now.set(new Date());
      this.updateDepartures();
    }, 10000);
    this.scheduleRefreshId = window.setInterval(() => {
      this.refreshAll();
    }, 900000);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      window.clearInterval(this.timerId);
    }
    if (this.scheduleRefreshId) {
      window.clearInterval(this.scheduleRefreshId);
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

  protected selectStop(stopId: string): void {
    if (stopId === this.selectedStopId()) {
      return;
    }
    const next = this.getStopConfig(stopId);
    if (!next) {
      return;
    }
    this.selectedStopId.set(stopId);
    this.routes.set(this.buildRoutes(stopId));
    this.combinedDepartures.set([]);
    this.refreshAll();
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

  private buildRoutes(stopId: string): RouteCard[] {
    const stop = this.getStopConfig(stopId);
    if (!stop) {
      return [];
    }
    return stop.routes.map((route) => ({
      ...route,
      state: 'loading'
    }));
  }

  private getStopConfig(stopId: string): BusStopConfig | undefined {
    return BUS_STOPS.find((stop) => stop.id === stopId);
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

interface RouteConfig {
  id: string;
  lineLabel: string;
  routeLabel: string;
  url: string;
}

interface BusStopConfig {
  id: string;
  label: string;
  routes: RouteConfig[];
}

const BUS_STOPS: BusStopConfig[] = [
  {
    id: 'liceul-saguna',
    label: 'Șaguna',
    routes: [
      {
        id: '50-dus',
        lineLabel: '50',
        routeLabel: 'Solomon - Camera de Comert',
        url: 'https://www.ratbv.ro/afisaje/50-dus/line_50_9_cl2_ro.html'
      },
      {
        id: '4-intors',
        lineLabel: '4',
        routeLabel: 'Tocile - Terminal Gara',
        url: 'https://www.ratbv.ro/afisaje/4-intors/line_4_3_cl1_ro.html'
      },
      {
        id: '52-intors',
        lineLabel: '52',
        routeLabel: 'Tocile - Roman (Panselelor)',
        url: 'https://www.ratbv.ro/afisaje/52-intors/line_52_3_cl1_ro.html'
      }
    ]
  },
  {
    id: 'cdc',
    label: 'CDC',
    routes: [
      {
        id: '4-dus',
        lineLabel: '4',
        routeLabel: 'CDC',
        url: 'https://www.ratbv.ro/afisaje/4-dus/line_4_5_cl2_ro.html'
      },
      {
        id: '50-intors',
        lineLabel: '50',
        routeLabel: 'CDC',
        url: 'https://www.ratbv.ro/afisaje/50-intors/line_50_1_cl1_ro.html'
      }
    ]
  },
  {
    id: 'Sanitas',
    label: 'Sanitas',
    routes: [
      {
        id: '4-dus',
        lineLabel: '4',
        routeLabel: 'Sanitas',
        url: 'https://www.ratbv.ro/afisaje/4-dus/line_4_6_cl2_ro.html'
      },
      {
        id: '50-intors',
        lineLabel: '50',
        routeLabel: 'Sanitas',
        url: 'https://www.ratbv.ro/afisaje/50-intors/line_50_2_cl1_ro.html'
      },
      {
        id: '52-intors',
        lineLabel: '52',
        routeLabel: 'Tocile - Roman (Panselelor)',
        url: 'https://www.ratbv.ro/afisaje/52-dus/line_52_13_cl2_ro.html'
      }
    ]
  },
  {
    id: 'Lidl',
    label: 'Lidl',
    routes: [
      {
        id: '41-intors',
        lineLabel: '41',
        routeLabel: 'Lidl',
        url: 'https://ratbv.ro/afisaje/41-dus/line_41_23_cl2_ro.html'
      }
    ]
  },
  {
    id: 'Livada',
    label: 'Livada',
    routes: [
      {
        id: '4-dus',
        lineLabel: '4',
        routeLabel: 'Livada',
        url: 'https://www.ratbv.ro/afisaje/4-dus/line_4_8_cl2_ro.html'
      },
      {
        id: '50-intors',
        lineLabel: '50',
        routeLabel: 'Livada',
        url: 'https://ratbv.ro/afisaje/50-intors/line_50_4_cl1_ro.html'
      }
    ]
  },
  {
    id: 'Gara',
    label: 'Gara',
    routes: [
      {
        id: '4-dus',
        lineLabel: '4',
        routeLabel: 'Livada',
        url: 'https://www.ratbv.ro/afisaje/4-dus/line_4_1_cl2_ro.html'
      }
    ]
  }

];
