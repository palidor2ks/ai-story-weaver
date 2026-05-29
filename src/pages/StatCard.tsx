import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PublicStatCard {
  id: string;
  source_url: string;
  source_title: string | null;
  stat_title: string;
  stat_value: string;
  stat_context: string | null;
  source_label: string | null;
  image_url: string | null;
  status: "approved" | "posted";
  created_at: string;
}

export default function StatCard() {
  const { id } = useParams();
  const [card, setCard] = useState<PublicStatCard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data } = await supabase
        .from("social_stat_cards" as any)
        .select("id, source_url, source_title, stat_title, stat_value, stat_context, source_label, image_url, status, created_at")
        .eq("id", id)
        .in("status", ["approved", "posted"])
        .maybeSingle();
      setCard((data as unknown as PublicStatCard) ?? null);
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <LoadingScreen />;

  if (!card) {
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>Stat card not available</CardTitle>
            <CardDescription>This card may still be awaiting review or may have been removed.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link to="/">Go to PoliPulse</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-10 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">PoliPulse</Link>
        <Badge variant={card.status === "posted" ? "default" : "outline"}>{card.status}</Badge>
      </div>

      <Card className="overflow-hidden">
        {card.image_url && (
          <div className="bg-muted flex justify-center p-4">
            <img src={card.image_url} alt={card.stat_title} className="max-h-[560px] rounded-xl object-contain" />
          </div>
        )}
        <CardHeader>
          <CardTitle className="text-3xl md:text-4xl">{card.stat_value}</CardTitle>
          <CardDescription className="text-lg">{card.stat_title}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {card.stat_context && <p className="text-muted-foreground">{card.stat_context}</p>}
          <a href={card.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
            Source: {card.source_label || card.source_title || new URL(card.source_url).hostname}
            <ExternalLink className="h-4 w-4" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
