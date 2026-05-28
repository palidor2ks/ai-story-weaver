import { useEffect } from 'react';
import { Header } from '@/components/Header';
import { Seo } from '@/components/Seo';

const SORO_SRC = 'https://app.trysoro.com/api/embed/b93e22d4-ef42-44c1-9514-450a619ebb6d';

export default function Blog() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = SORO_SRC;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
      const mount = document.getElementById('soro-blog');
      if (mount) mount.innerHTML = '';
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Blog — Pulse"
        description="Latest updates, articles, and product news from the Pulse team."
        path="/blog"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Pulse Blog",
          description: "Latest updates, articles, and product news from the Pulse team.",
          url: "https://www.polipulseapp.com/blog",
        }}
      />
      <Header />
      <main className="container mx-auto py-8">
        <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">Blog</h1>
        <p className="text-muted-foreground mb-6">Latest updates, articles, and product news from the Pulse team.</p>
        <div id="soro-blog" />
      </main>
    </div>
  );
}
