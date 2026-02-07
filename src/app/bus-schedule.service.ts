import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export type DayType = 'weekday' | 'saturday' | 'sunday';

export interface ScheduleSet {
  weekday: number[];
  saturday: number[];
  sunday: number[];
}

export interface RouteDetails {
  line: string;
  route: string;
  station: string;
  validFrom?: string;
}

export interface RouteSchedule {
  details: RouteDetails;
  schedules: ScheduleSet;
  sourceUrl: string;
  viaProxy: boolean;
}

@Injectable({ providedIn: 'root' })
export class BusScheduleService {
  private readonly http = inject(HttpClient);

  async loadSchedule(sourceUrl: string): Promise<RouteSchedule> {
    const { html, viaProxy } = await this.fetchHtml(sourceUrl);
    return this.parseHtml(html, sourceUrl, viaProxy);
  }

  private async fetchHtml(sourceUrl: string): Promise<{ html: string; viaProxy: boolean }> {
    const url = new URL(sourceUrl);
    const cacheKey = Date.now().toString();
    url.searchParams.set('t', cacheKey);
    const apiUrl = `/api/ratbv?path=${encodeURIComponent(url.pathname)}&t=${cacheKey}`;
    const proxyUrl = `/ratbv${url.pathname}${url.search}`;
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const attempts = isLocal
      ? [
          { url: proxyUrl, viaProxy: true },
          { url: apiUrl, viaProxy: true },
          { url: url.toString(), viaProxy: false }
        ]
      : [
          { url: apiUrl, viaProxy: true },
          { url: proxyUrl, viaProxy: true },
          { url: url.toString(), viaProxy: false }
        ];
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const html = await firstValueFrom(this.http.get(attempt.url, { responseType: 'text' }));
        return { html, viaProxy: attempt.viaProxy };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error('Failed to fetch schedule');
  }

  private parseHtml(html: string, sourceUrl: string, viaProxy: boolean): RouteSchedule {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const details: RouteDetails = {
      line: this.extractText(doc.querySelector('#linia_web b')) ?? '',
      route: this.extractText(doc.querySelector('#web_traseu b')) ?? '',
      station: this.extractText(doc.querySelector('#statie_web b')) ?? '',
      validFrom: this.extractText(doc.querySelector('#web_valabil b')) ?? undefined
    };

    const schedules: ScheduleSet = {
      weekday: [],
      saturday: [],
      sunday: []
    };

    const tables = Array.from(doc.querySelectorAll('#tabel2'));
    for (const table of tables) {
      const title = this.extractText(table.querySelector('#web_class_title')) ?? '';
      const dayType = this.parseDayType(title);
      if (!dayType) {
        continue;
      }

      const hourNodes = Array.from(table.querySelectorAll('#web_class_hours'));
      const minuteNodes = Array.from(table.querySelectorAll('#web_class_minutes'));
      const times: number[] = [];
      const count = Math.min(hourNodes.length, minuteNodes.length);

      for (let i = 0; i < count; i += 1) {
        const hour = this.parseNumber(hourNodes[i]?.textContent);
        if (hour === null || hour > 23) {
          continue;
        }
        const minutes = this.parseMinutes(minuteNodes[i]);
        for (const minute of minutes) {
          times.push(hour * 60 + minute);
        }
      }

      const unique = Array.from(new Set(times)).sort((a, b) => a - b);

      if (dayType === 'weekend') {
        schedules.saturday = unique;
        schedules.sunday = unique;
      } else {
        schedules[dayType] = unique;
      }
    }

    return {
      details,
      schedules,
      sourceUrl,
      viaProxy
    };
  }

  private extractText(node: Element | null): string | null {
    if (!node) {
      return null;
    }
    const text = node.textContent ?? '';
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parseNumber(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }
    const digits = value.replace(/[^\d]/g, '');
    if (!digits) {
      return null;
    }
    const parsed = Number.parseInt(digits, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private parseMinutes(container: Element | null): number[] {
    if (!container) {
      return [];
    }
    const minuteNodes = Array.from(container.querySelectorAll('#web_min'));
    if (minuteNodes.length > 0) {
      return minuteNodes
        .map((node) => this.parseNumber(node.textContent))
        .filter((value): value is number => value !== null && value < 60);
    }

    const text = (container.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || text.includes('--')) {
      return [];
    }

    const matches = text.match(/\d{1,2}/g) ?? [];
    return matches
      .map((match) => Number.parseInt(match, 10))
      .filter((value) => !Number.isNaN(value) && value < 60);
  }

  private parseDayType(title: string): DayType | 'weekend' | null {
    const normalized = title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();

    if (normalized === 'LUNI-VINERI' || normalized === 'MONDAY-FRIDAY') {
      return 'weekday';
    }
    if (normalized === 'SAMBATA - DUMINICA' || normalized === 'SATURDAY - SUNDAY') {
      return 'weekend';
    }
    if (normalized === 'SAMBATA' || normalized === 'SATURDAY') {
      return 'saturday';
    }
    if (normalized === 'DUMINICA' || normalized === 'SUNDAY') {
      return 'sunday';
    }

    return null;
  }
}
