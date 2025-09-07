import {ComponentFixture, TestBed} from '@angular/core/testing';
import {AppComponent} from './app.component';
import {Component} from "@angular/core";

@Component({selector: 'app-calendar', template: ''})
class CalendarStubComponent {}

describe('AppComponent', () => {
	let fixture: ComponentFixture<AppComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			declarations: [AppComponent, CalendarStubComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(AppComponent);
	});

	it('should create the app', () => {
		expect(fixture.componentInstance).toBeTruthy();
	});

	it(`should have as title 'Timely Calendar'`, () => {
		expect(fixture.componentInstance.title).toEqual('Timely Calendar');
	});

	it('should render <app-calendar>', () => {
		const el: HTMLElement = fixture.nativeElement;
		fixture.detectChanges();
		expect(el.querySelector('app-calendar')).toBeTruthy();
	});
});
