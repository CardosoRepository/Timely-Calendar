# Timely Calendar

Angular application for browsing events from the Timely API in an interactive monthly calendar.

The project was built as a front-end test, with focus on API integration, filtering, reusable components, loading/error handling and a responsive interface.

## Deploy

Access the application:

https://cardosorepository.github.io/Timely-Calendar/

## Features

- Monthly calendar view for event browsing
- Previous and next month navigation
- Month and year selector
- Search by event title or description
- Date range filter with date picker
- Category filter with multi-select, search, pagination and apply/clear actions
- Tag filter with multi-select, search, pagination and apply/clear actions
- Event details modal with:
  - title
  - status
  - price
  - event timezone
  - local time
  - tickets
  - description
  - source link
- Event image display when available
- Loading and error states
- Retry option when requests fail
- Responsive layout
- Accessibility improvements with keyboard navigation and ARIA labels

## Tech Stack

- Angular 13
- TypeScript
- Angular Material
- RxJS
- SCSS
- Jasmine
- Karma

## Project Structure

```txt
src/
├── app/
│   ├── components/
│   │   ├── calendar/
│   │   └── event-dialog/
│   ├── models/
│   ├── services/
│   └── interceptors/
├── assets/
└── environments/
```

## Main Components

### AppComponent

Base layout of the application.

### CalendarComponent

Responsible for the monthly calendar view, event listing, filters and navigation controls.

### EventDialogComponent

Modal used to display detailed information about a selected event.

### TimelyService

Handles communication with the Timely API.

### ApiKeyInterceptor

Adds the required API key header to requests automatically.

## API Integration

The application consumes Timely API endpoints to load calendar information and events.

Main requests used by the application:

```txt
POST https://timelyapp.time.ly/api/calendars/info
GET https://timelyapp.time.ly/api/calendars/{CALENDAR_ID}/events
```

The `ApiKeyInterceptor` adds the `X-Api-Key` header to API requests.

## Environment Configuration

The API configuration is located in the Angular environment files:

```txt
src/environments/environment.ts
src/environments/environment.prod.ts
```

Before using the project with another Timely calendar, update the following values:

```ts
export const environment = {
  production: false,
  apiBase: 'https://timelyapp.time.ly',
  apiKey: 'YOUR_API_KEY',
  calendarUrl: 'YOUR_CALENDAR_URL'
};
```

For production builds, apply the same configuration to `environment.prod.ts`.

## Getting Started

### Prerequisites

- Node.js 14 or higher
- Angular CLI 13 or higher
- npm

### Installation

```bash
npm install
```

### Run the development server

```bash
npm start
```

Or:

```bash
ng serve
```

Open the application at:

```txt
http://localhost:4200
```

## Running Tests

```bash
npm test
```

To run tests with coverage:

```bash
ng test --code-coverage
```

## Build

```bash
npm run build
```

The build files will be generated in the `dist/` directory.

## Notes

- The project uses strongly typed models for calendar and event data.
- The interface was designed to work across different screen sizes.
- Loading and error states were implemented to improve user experience during API requests.
- Unit tests were added for the main application parts.

## Future Improvements

- Add lazy loading for large event lists
- Add dark mode
- Add week and agenda calendar views
- Add internationalization support
- Add location and status filters
- Add CI/CD workflow for automated builds and tests

## Deployment

This project is deployed with GitHub Pages using GitHub Actions.

Every push to the `main` branch triggers a production build and publishes the application automatically.
