import {Injectable} from '@angular/core';
import {
	HttpEvent, HttpHandler, HttpInterceptor, HttpRequest
} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';

@Injectable()
export class ApiKeyInterceptor implements HttpInterceptor {
	intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {

		const cloned = req.clone({
			setHeaders: {'X-Api-Key': environment.apiKey}
		});
		return next.handle(cloned);
	}
}
