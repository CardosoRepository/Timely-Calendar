import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {ReactiveFormsModule} from '@angular/forms';
import {MatMenuModule} from '@angular/material/menu';
import {MatListModule} from '@angular/material/list';
import {FilterMultiSelectComponent} from "./filter-multi-select/filter-multi-select.component";
import {MatInputModule} from "@angular/material/input";

@NgModule({
	declarations: [FilterMultiSelectComponent],
	imports: [
		CommonModule,
		ReactiveFormsModule,
		MatMenuModule,
		MatListModule,
		MatInputModule,
	],
	exports: [FilterMultiSelectComponent,]
})
export class SharedModule {
}
