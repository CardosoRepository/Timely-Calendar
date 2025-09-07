import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {HTTP_INTERCEPTORS, HttpClientModule} from "@angular/common/http";
import {ApiKeyInterceptor} from "./core/interceptors/api-key.interceptor";
import {FormsModule, ReactiveFormsModule} from "@angular/forms";
import {CalendarComponent} from "./features/calendar/calendar.component";

@NgModule({
	declarations: [
		AppComponent,
		CalendarComponent
	],
	imports: [
		BrowserModule,
		AppRoutingModule,
		HttpClientModule,
		ReactiveFormsModule,
		FormsModule
	],
	providers: [
		{ provide: HTTP_INTERCEPTORS, useClass: ApiKeyInterceptor, multi: true }
	],
	bootstrap: [AppComponent]
})
export class AppModule {
}
