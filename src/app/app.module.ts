import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import {BrowserAnimationsModule} from "@angular/platform-browser/animations";
import {MatProgressSpinnerModule} from "@angular/material/progress-spinner";

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HTTP_INTERCEPTORS, HttpClientModule} from "@angular/common/http";
import {ApiKeyInterceptor} from "./core/interceptors/api-key.interceptor";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {CalendarComponent} from "./features/calendar/calendar.component";
import {MatDialogModule} from "@angular/material/dialog";
import {EventDialogComponent} from "./features/calendar/event-dialog/event-dialog.component";

@NgModule({
	declarations: [
		AppComponent,
		CalendarComponent,
		EventDialogComponent
	],
	imports: [
		BrowserModule,
		AppRoutingModule,
		HttpClientModule,
		ReactiveFormsModule,
		FormsModule,
		MatDatepickerModule,
		MatNativeDateModule,
		MatFormFieldModule,
		MatInputModule,
		MatChipsModule,
		MatIconModule,
		MatCheckboxModule,
		MatButtonModule,
		BrowserAnimationsModule,
		MatProgressSpinnerModule,
		MatDialogModule
	],
	providers: [
		{ provide: HTTP_INTERCEPTORS, useClass: ApiKeyInterceptor, multi: true }
	],
	bootstrap: [AppComponent]
})
export class AppModule {
}
