'use client';

import { Button } from '@/components/ui/button';
import { GithubIcon } from '@/components/icons';

export default function LoginPage() {
  const handleLogin = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    window.location.href = `${apiUrl}/api/auth/github`;
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