import { useEffect } from 'react';
import { Header } from '@/components/Header';

const SORO_SRC = 'https://app.trysoro.com/api/embed/b93e22d4-ef42-44c1-9514-450a619ebb6d';

export default function Blog() {
  useEffect(() => {
    document.title = 'Blog | Pulse';
    const metaName = 'description';
    let meta = document.querySelector(`meta[name="${metaName}"]`) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = metaName;
      document.head.appendChild(meta);
    }
    const prevDesc = meta.content;
    meta.content = 'Latest updates and articles from Pulse.';

    const script = document.createElement('script');
    script.src = SORO_SRC;
    script.defer = true;
    document.body.appendChild(script);

    return () => {
      meta!.content = prevDesc;
      script.remove();
      const mount = document.getElementById('soro-blog');
      if (mount) mount.innerHTML = '';
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto py-8">
        <h1 className="sr-only">Blog</h1>
        <div id="soro-blog" />
      </main>
    </div>
  );
}
