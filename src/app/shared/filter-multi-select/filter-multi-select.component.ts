import {Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {FormControl} from '@angular/forms';
import {MatMenuTrigger} from '@angular/material/menu';
import {MatSelectionListChange} from '@angular/material/list';
import {Observable, Subject} from 'rxjs';
import {debounceTime, distinctUntilChanged, map, switchMap, takeUntil, tap} from 'rxjs/operators';

type Option = { id: number; title: string; color?: string | null };
type Page<T> = {
	items: T[];
	current_page?: number;
	last_page?: number;
	next_page_url?: string | null;
	per_page?: number
};

export type FetchPageFn = (args: { page: number; perPage: number; title: string }) => Observable<Page<Option>>;

/**
 * Reusable multi-select filter with search, paging and "Apply/Clear".
 * - Fetches pages lazily via `fetchPage`.
 * - Keeps a staged selection (not applied until user clicks Apply).
 */
@Component({
	selector: 'app-filter-multi-select',
	templateUrl: './filter-multi-select.component.html',
	styleUrls: ['./filter-multi-select.component.scss'],
})
export class FilterMultiSelectComponent implements OnInit, OnDestroy {
	/** Chip label (e.g., "Categories", "Tags"). */
	@Input() label = 'Filter';
	/** Currently applied ids (controlled by parent). */
	@Input() selectedIds: number[] = [];
	/** Page fetcher: ({ title, page, perPage }) => Observable<Page<Option>>. */
	@Input() fetchPage!: FetchPageFn;
	/** Items per page when fetching. */
	@Input() perPage = 50;

	/** Emits applied ids. */
	@Output() apply = new EventEmitter<number[]>();
	/** Emits when Clear is clicked. */
	@Output() cleared = new EventEmitter<void>();

	/** Menu trigger (to close programmatically). */
	@ViewChild(MatMenuTrigger) trigger!: MatMenuTrigger;

	/** Search box control (debounced). */
	search = new FormControl('');
	/** Accumulated items from paged results. */
	items: Option[] = [];
	/** In-progress selection (only committed on Apply). */
	staged = new Set<number>();
	/** Loading flag for UI state. */
	loading = false;
	/** Current page (1-based). */
	page = 1;
	/** Whether there are more pages to fetch. */
	hasMore = true;

	/** Teardown for rxjs subscriptions. */
	private destroy$ = new Subject<void>();

	/** Wire up debounced search → paging reset → first page load. */
	ngOnInit(): void {
		this.search.valueChanges.pipe(
			debounceTime(250),
			distinctUntilChanged(),
			map(v => (v ?? '').toString().trim()),
			tap(() => this.resetPaging()),
			switchMap(term => this.load(term, 1)),
			takeUntil(this.destroy$)
		).subscribe();
	}

	/** Complete subscriptions. */
	ngOnDestroy(): void {
		this.destroy$.next();
		this.destroy$.complete();
	}

	/** When menu opens: sync staged selection and ensure first load. */
	onOpened(): void {
		this.staged = new Set(this.selectedIds ?? []);
		if (!this.items.length) {
			this.resetPaging();
			this.load(this.term, 1).subscribe();
		}
	}

	/** Chip text reflecting applied count. */
	get chipText() {
		const n = this.selectedIds?.length ?? 0;
		return n ? `${n} ${this.label}` : this.label;
	}

	/** Update staged set when user toggles list options. */
	onSelectionChange(ev: MatSelectionListChange): void {
		const ids = ev.source.selectedOptions.selected.map(o => o.value as number);
		this.staged = new Set(ids);
	}

	/** Clear staged selection and notify parent, then close the menu. */
	clear(): void {
		this.staged.clear();
		this.cleared.emit();
		this.trigger?.closeMenu();
	}

	/** Apply staged ids, notify parent, then close the menu. */
	applyNow(): void {
		this.selectedIds = Array.from(this.staged);
		this.apply.emit(this.selectedIds);
		this.trigger?.closeMenu();
	}

	/** Normalized search term. */
	get term() {
		return (this.search.value ?? '').toString().trim();
	}

	/** Infinite scroll: fetch next page when near the bottom. */
	onScroll(ev: Event): void {
		const el = ev.target as HTMLElement | null;
		if (!el || this.loading || !this.hasMore) return;

		const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
		if (nearBottom) this.load(this.term, this.page + 1).subscribe();
	}

	/**
	 * Fetch a page, merge/dedupe items, update paging state and flags.
	 * Returns Observable<void> for chaining in template/handlers.
	 */
	load(term: string, page: number): Observable<void> {
		this.loading = true;
		return this.fetchPage({title: term, page, perPage: this.perPage}).pipe(
			tap(
				res => {
					const newItems = res.items ?? [];
					this.items = page === 1 ? newItems : this.dedupe([...this.items, ...newItems]);
					this.page = page;
					this.hasMore =
						(res.current_page ?? page) < (res.last_page ?? page) || !!res.next_page_url;
					this.loading = false;
				},
				() => (this.loading = false)
			),
			map(() => void 0)
		);
	}

	/** Reset paging state before a new search. */
	resetPaging() {
		this.page = 1;
		this.hasMore = true;
		this.items = [];
	}

	/** Remove duplicated items by `id`. */
	private dedupe<T extends { id: number | string }>(arr: T[]): T[] {
		const seen = new Set<string>();
		return arr.filter(i => {
			const k = String(i?.id);
			if (!k || seen.has(k)) return false;
			seen.add(k);
			return true;
		});
	}

	track = (_: number, o: Option) => o.id;
}
