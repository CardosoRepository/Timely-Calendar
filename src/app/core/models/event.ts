export interface TimelyEvent {
	id: number;
	title: string;
	start: string;
	end?: string;
	descriptionShort?: string;
	imageUrl?: string;
}
