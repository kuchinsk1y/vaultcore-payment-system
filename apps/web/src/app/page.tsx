import { redirect } from 'next/navigation';

// The dashboard lives at /dashboard; the dashboard layout sends signed-out visitors to /login.
export default function Home() {
  redirect('/dashboard');
}
