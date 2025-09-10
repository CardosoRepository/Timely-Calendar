import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';
import {of} from 'rxjs';
import {EventDialogComponent} from './event-dialog.component';
import {TimelyService} from "../../../core/services/timely.service";
import {NO_ERRORS_SCHEMA} from "@angular/core";

describe('EventDialogComponent', () => {
	let component: EventDialogComponent;
	let fixture: ComponentFixture<EventDialogComponent>;
	let timelySpy: jasmine.SpyObj<TimelyService>;

	beforeEach(async () => {
		timelySpy = jasmine.createSpyObj('TimelyService', ['fetchEventRaw']);

		await TestBed.configureTestingModule({
			declarations: [EventDialogComponent],
			providers: [
				{provide: TimelyService, useValue: timelySpy},
				{provide: MatDialogRef, useValue: {close: jasmine.createSpy('close')}},
				{provide: MAT_DIALOG_DATA, useValue: {id: 123, timezone: 'America/Sao_Paulo'}}
			],
			schemas: [NO_ERRORS_SCHEMA]
		}).compileComponents();

		fixture = TestBed.createComponent(EventDialogComponent);
		component = fixture.componentInstance;
	});

	it('should fetch event data on init and set eventDetail', () => {
		const mockEvent = {id: 123, title: 'Test Event', timezone: 'America/Sao_Paulo'};
		timelySpy.fetchEventRaw.and.returnValue(of(mockEvent));

		component.ngOnInit();

		expect(timelySpy.fetchEventRaw).toHaveBeenCalledWith(123, 'America/Sao_Paulo');
		expect(component.eventDetail).toEqual(mockEvent);
	});

	it('should close the dialog when close() is called', () => {
		const dialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<EventDialogComponent>>;
		component.close();
		expect(dialogRef.close).toHaveBeenCalled();
	});

	it('should return description from descHtml with fallback to description_short', () => {
		component['eventDetail'] = { description: 'Full description', description_short: 'Short desc' };
		expect(component.descHtml).toBe('Full description');

		component['eventDetail'] = { description: null, description_short: 'Short desc only' };
		expect(component.descHtml).toBe('Short desc only');

		component['eventDetail'] = null as any;
		expect(component.descHtml).toBeNull();
	});
});
