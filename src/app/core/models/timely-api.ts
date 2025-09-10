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
