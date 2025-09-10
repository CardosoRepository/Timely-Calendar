import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from "@angular/material/dialog";
import {TimelyService} from "../../../core/services/timely.service";

@Component({
	selector: 'app-event-dialog',
	templateUrl: './event-dialog.component.html',
	styleUrls: ['./event-dialog.component.scss'],
})
export class EventDialogComponent implements OnInit {

	userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	eventDetail: any = null;

	constructor(
		private dialogRef: MatDialogRef<EventDialogComponent>,
		@Inject(MAT_DIALOG_DATA) public data: any,
		private timely: TimelyService
	) {
	}


	ngOnInit(): void {
		const tz = this.data.timezone ?? 'America/Sao_Paulo';
		this.timely.fetchEventRaw(this.data.id, tz).subscribe(ev => {
			this.eventDetail = ev;
		});
	}

	get descHtml(): string | null {
		return this.eventDetail?.description ?? this.eventDetail?.description_short ?? null;
	}

	close(): void {
		this.dialogRef.close();
	}

	private parseUtc(iso?: string | null): Date | null {
		if (!iso) return null;
		const withT = iso.includes('T') ? iso : iso.replace(' ', 'T');
		const utcIso = withT.endsWith('Z') ? withT : `${withT}Z`;
		const d = new Date(utcIso);
		return isNaN(d.getTime()) ? null : d;
	}

	usTime(iso: string, tz: string): string {
		const d = this.parseUtc(iso)!;
		return new Intl.DateTimeFormat('en-US', {
			timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
		}).format(d).toLowerCase(); // "3:00pm"
	}

	dateLabelUs(iso: string, tz: string): string {
		const d = this.parseUtc(iso)!;
		return new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
		}).format(d);
	}

	get eventTz(): string {
		return this.eventDetail?.timezone || 'America/Edmonton';
	}
}
