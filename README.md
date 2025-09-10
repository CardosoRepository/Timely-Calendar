# 📅 Timely Calendar (Angular Test Project)

This is a **Frontend Developer Test** project built with **Angular** and **TypeScript**, implementing an interactive calendar that consumes the public [Timely](https://time.ly) API.

## 🚀 Features

- Display events in a monthly calendar view.  
- Search & filtering:  
  - 🔍 **Search by title or description**.  
  - 📅 **Date range filter with date picker**.
  - 🗂️ **Categories filter (multi-select)** com busca, paginação (infinite scroll) e ações **Apply/Clear**.
  - 🏷️ **Tags filter (multi-select)** com o mesmo comportamento (busca, paginação, Apply/Clear).

- Month navigation with **previous/next buttons and month/year selector**.  
- Event details in a **modal dialog** (title, status, price, event timezone & local time, tickets, description, source link).  
- Event images displayed when available.  
- Handles **loading and error states**, with retry option.  
- Responsive and accessible UI (keyboard navigation, ARIA labels, etc.).  

## 🛠️ Tech Stack

- [Angular 13](https://angular.io/) + [TypeScript](https://www.typescriptlang.org/)  
- [Angular Material](https://material.angular.io/) (Datepicker and UI components)  
- RxJS for async requests  
- SCSS for custom styling  
- Unit testing with **Jasmine + Karma**  
- Linting with **TSLint/ESLint**  

## 📂 Components Overview

- **`AppComponent`** → Base layout with header and calendar.  
- **`CalendarComponent`** → Monthly grid, filters, and event listing.  
- **`EventDialogComponent`** → Modal dialog with event details.  
- **`TimelyService`** → Service handling API communication with Timely.  
- **`ApiKeyInterceptor`** → HTTP interceptor to inject API key automatically.  
- **Models** (`event.ts`, `calendar-day.model.ts`, etc.) with strong TypeScript typing.  

## 🔗 API Integration

1. **Get calendar settings**  
   `POST https://timelyapp.time.ly/api/calendars/info`  

2. **Fetch events**  
   `GET https://timelyapp.time.ly/api/calendars/{CALENDAR_ID}/events`  

> The project uses `ApiKeyInterceptor` to automatically add the `X-Api-Key` header to all requests.  

## 🧪 Testing

- `*.spec.ts` files include unit tests for main components (`App`, `Calendar`, `EventDialog`).  
- Uses `HttpClientTestingModule` and `HttpTestingController` for request mocking.  
- Code coverage ensured with **coverage report**.  

## ▶️ Getting Started

### Prerequisites
- Node.js v14+  
- Angular CLI v13+  

### Installation
```bash
npm install
```

### Run in development mode
```bash
ng serve
```
Open [http://localhost:4200](http://localhost:4200).

### Run tests
```bash
ng test --code-coverage
```

### Build for production
```bash
ng build --prod
```

## 📌 Notes

- All code and comments are written in English following best practices.  
- The UI was designed to be **clean, responsive, and accessible**.  
- Project is versioned with **Git**.  

## 🔮 Future Improvements

- Implement **lazy loading** for events to handle large datasets efficiently.  
- Add **dark mode** support.  
- Provide multiple calendar layouts (e.g., **week view, agenda view**) in addition to the monthly view.  
- Add **internationalization (i18n)** support for multiple languages.  
- Extend filtering with more options (e.g., categories, location, status).  
- Integrate with **CI/CD pipelines** for automated builds and tests.  
