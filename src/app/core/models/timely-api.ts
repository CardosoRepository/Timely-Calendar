export interface TimelyApiCalendarInfo {
	id: number;
	title?: string;
}

export interface TimelyApiImageSize { url: string; width?: number; height?: number; }
export interface TimelyApiImage {
	sizes?: {
		thumbnail?: TimelyApiImageSize;
		small?: TimelyApiImageSize;
		medium?: TimelyApiImageSize;
		full?: TimelyApiImageSize;
	};
}

export interface TimelyApiEvent {
	id: number | string;
	title: string;
	description_short?: string;
	start_datetime?: string;
	end_datetime?: string;
	start_utc_datetime?: string;
	end_utc_datetime?: string;
	images?: TimelyApiImage[];
}

export type FilterOption = {
	id: number;
	title: string;
	color?: string | null;
};

export type Page<T> = {
	items: T[];
	current_page?: number;
	last_page?: number;
	next_page_url?: string | null;
	per_page?: number;
};

export type MaybeData<T> = T | { data: T };

export type Taxonomy = 'categories' | 'tags' | 'organizers' | 'venues';
