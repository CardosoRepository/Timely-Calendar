import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";
import {TimelyService} from "../../../core/services/timely.service";

@Component({
	selector: 'app-event-dialog',
	templateUrl: './event-dialog.component.html',
	styleUrls: ['./event-dialog.component.scss'],
})
export class EventDialogComponent implements OnInit {
	/** User’s system time zone */
	userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

	/** Loaded event details from the API. */
	eventDetail: any = null;

	constructor(
		private dialogRef: MatDialogRef<EventDialogComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any,
		private timely: TimelyService
	) {
	}

	/** On init: fetch event details by id and timezone. */
	ngOnInit(): void {
		const tz = this.data.timezone ?? 'America/Sao_Paulo';
		this.timely.fetchEventRaw(this.data.id, tz).subscribe(ev => {
			this.eventDetail = ev;
		});
	}

	/** Returns event description (HTML) or null if missing. */
	get descHtml(): string | null {
		return this.eventDetail?.description ?? this.eventDetail?.description_short ?? null;
	}

	/** Close the dialog. */
	close(): void {
		this.dialogRef.close();
	}

	// ---------------- Date parsing & formatting ----------------

	/** Parse an ISO string (with or without Z) into a UTC Date. */
	private parseUtc(iso?: string | null): Date | null {
		if (!iso) return null;
		const withT = iso.includes('T') ? iso : iso.replace(' ', 'T');
		const utcIso = withT.endsWith('Z') ? withT : `${withT}Z`;
		const d = new Date(utcIso);
		return isNaN(d.getTime()) ? null : d;
	}

	/** Format time (hh:mm am/pm) in a given timezone. */
	usTime(iso: string, tz: string): string {
		const d = this.parseUtc(iso)!;
		return new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		}).format(d).toLowerCase(); // e.g. "3:00pm"
	}

	/** Format date (Weekday, Month Day, Year) in a given timezone. */
	dateLabelUs(iso: string, tz: string): string {
		const d = this.parseUtc(iso)!;
		return new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		}).format(d);
	}

	/** Event’s timezone (fallback to America/Edmonton). */
	get eventTz(): string {
		return this.eventDetail?.timezone || 'America/Edmonton';
	}
}
