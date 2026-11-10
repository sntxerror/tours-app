import type { User } from '../types';
import { http } from './http';

export interface Credentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

export const login = (credentials: Credentials) =>
  http.post<LoginResponse>('/auth/login', credentials).then((r) => r.data);

export const me = () => http.get<User>('/auth/me').then((r) => r.data);
