import { Helmet } from "react-helmet-async";

const SITE_URL = "https://www.polipulseapp.com";

interface SeoProps {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
  image?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noIndex?: boolean;
}

export function Seo({ title, description, path, type = "website", image, jsonLd, noIndex }: SeoProps) {
  const url = `${SITE_URL}${path}`;
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      {image && <meta property="og:image" content={image} />}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {image && <meta name="twitter:image" content={image} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
