import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Phone, 
  Globe, 
  Mail, 
  MapPin, 
  Twitter, 
  Facebook, 
  Youtube, 
  Instagram,
  Building2,
  ExternalLink,
  Clock
} from 'lucide-react';
import { Representative, SocialMedia, DistrictOffice } from '@/hooks/useRepresentatives';

interface ContactInfoCardProps {
  representative: Representative;
}

export function ContactInfoCard({ representative }: ContactInfoCardProps) {
  const { 
    phone, 
    website_url, 
    address, 
    contact_form, 
    fax,
    dc_office,
    social_media, 
    district_offices 
  } = representative;

  const hasSocialMedia = social_media && Object.keys(social_media).length > 0;
  const hasDistrictOffices = district_offices && district_offices.length > 0;
  const hasContactInfo = phone || website_url || address || contact_form;

  if (!hasContactInfo && !hasSocialMedia && !hasDistrictOffices) {
    return null;
  }

  return (
    <Card className="shadow-elevated">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          Contact Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Primary Contact Info */}
        {hasContactInfo && (
          <div className="space-y-3">
            {website_url && (
              <a 
                href={website_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-foreground hover:text-primary transition-colors group"
              >
                <Globe className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
                <span className="flex-1 truncate">{website_url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                <ExternalLink className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            
            {phone && (
              <a 
                href={`tel:${phone}`}
                className="flex items-center gap-3 text-foreground hover:text-primary transition-colors"
              >
                <Phone className="w-5 h-5 text-muted-foreground" />
                <span>{phone}</span>
              </a>
            )}
            
            {fax && (
              <div className="flex items-center gap-3 text-muted-foreground">
                <Phone className="w-5 h-5" />
                <span>Fax: {fax}</span>
              </div>
            )}
            
            {(address || dc_office) && (
              <div className="flex items-start gap-3 text-foreground">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  {dc_office && <p className="font-medium">{dc_office}</p>}
                  {address && <p className="text-muted-foreground text-sm">{address}</p>}
                </div>
              </div>
            )}
            
            {contact_form && (
              <a 
                href={contact_form} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <Mail className="w-4 h-4" />
                  Contact Form
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            )}
          </div>
        )}

        {/* Social Media */}
        {hasSocialMedia && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Social Media</h4>
            <div className="flex flex-wrap gap-2">
              {social_media?.twitter && (
                <a 
                  href={`https://twitter.com/${social_media.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <Twitter className="w-4 h-4" />
                    @{social_media.twitter}
                  </Button>
                </a>
              )}
              
              {social_media?.facebook && (
                <a 
                  href={`https://facebook.com/${social_media.facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <Facebook className="w-4 h-4" />
                    Facebook
                  </Button>
                </a>
              )}
              
              {social_media?.youtube && (
                <a 
                  href={`https://youtube.com/${social_media.youtube}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <Youtube className="w-4 h-4" />
                    YouTube
                  </Button>
                </a>
              )}
              
              {social_media?.instagram && (
                <a 
                  href={`https://instagram.com/${social_media.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="gap-2">
                    <Instagram className="w-4 h-4" />
                    Instagram
                  </Button>
                </a>
              )}
            </div>
          </div>
        )}

        {/* District Offices */}
        {hasDistrictOffices && (
          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              District Offices ({district_offices!.length})
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {district_offices!.slice(0, 4).map((office, index) => (
                <div 
                  key={index} 
                  className="p-3 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      {office.building && <p className="font-medium">{office.building}</p>}
                      {office.suite && <p>{office.suite}</p>}
                      <p>{office.address}</p>
                      <p>{office.city}, {office.state} {office.zip}</p>
                      {office.phone && (
                        <a 
                          href={`tel:${office.phone}`}
                          className="text-primary hover:underline flex items-center gap-1 mt-1"
                        >
                          <Phone className="w-3 h-3" />
                          {office.phone}
                        </a>
                      )}
                      {office.hours && (
                        <p className="text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="w-3 h-3" />
                          {office.hours}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {district_offices!.length > 4 && (
              <p className="text-sm text-muted-foreground mt-2">
                + {district_offices!.length - 4} more offices
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
