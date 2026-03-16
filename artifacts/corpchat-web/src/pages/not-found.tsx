import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="flex justify-center">
          <div className="w-24 h-24 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-destructive" />
          </div>
        </div>
        <h1 className="text-4xl font-display font-bold text-foreground">404</h1>
        <p className="text-xl text-muted-foreground">Page not found</p>
        <p className="text-sm text-muted-foreground/80">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <div className="pt-4">
          <Link href="/chat">
            <Button size="lg" className="w-full">Return to App</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
