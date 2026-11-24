'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { GithubIcon } from '@/components/icons';
import { fetchMe, getApiBaseUrl } from '@/lib/api';

const ERROR_MESSAGES = {
  not_admin: 'This GitHub account is not authorized to access cShip.',
  auth_failed: 'GitHub sign-in failed. Please try again.',
  session_expired: 'Your session expired. Please sign in again.',
};

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setError(ERROR_MESSAGES[params.get('error')] || '');

    // If a valid session already exists, skip the login screen.
    let active = true;
    fetchMe()
      .then((data) => {
        if (active && data?.user) router.replace('/');
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogin = () => {
    window.location.href = `${getApiBaseUrl()}/api/auth/github`;
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-mono font-bold text-text">cShip</h1>
          <p className="mt-2 text-muted">Deploy to cPanel with GitHub</p>
        </div>

        <div className="panel p-8">
          <h2 className="text-xl font-semibold mb-6 text-center">Sign in to continue</h2>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <Button
            onClick={handleLogin}
            className="w-full"
            size="lg"
            variant="primary"
          >
            <GithubIcon className="mr-2 h-5 w-5" />
            Sign in with GitHub
          </Button>

          <p className="mt-6 text-center text-sm text-muted">
            Only authorized administrators can access cShip.
          </p>
        </div>
      </div>
    </main>
  );
}
