import {Component, OnInit} from '@angular/core';
import {TimelyEvent} from "./core/models/event";
import {TimelyService} from "./core/services/timely.service";

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
	title = 'Timely Calendar';
	loading = false;
	events: TimelyEvent[] = [];
	error: string | null = null;

	constructor(private timely: TimelyService) {
	}

	ngOnInit(): void {
		this.loading = true;
		this.timely.getEventsFromConfiguredCalendar({size: 20}).subscribe({
			next: (events) => {
				this.events = events;
				this.loading = false;
			},
			error: (err) => {
				this.error = err?.userMessage ?? 'Falha ao carregar dados.';
				this.loading = false;
			}
		});
	}
}
