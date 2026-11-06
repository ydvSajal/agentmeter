import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { DocsNavigation } from "@/components/docs/docs-navigation";
import { documents } from "@/lib/docs";
import "../public.css";
import "./docs.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site docs-site">
      <a className="skip-link" href="#docs-main">
        Skip to documentation
      </a>
      <PublicHeader />
      <div className="docs-layout">
        <aside className="docs-sidebar">
          <DocsNavigation
            documents={documents.map(({ slug, title, group, description }) => ({
              slug,
              title,
              group,
              description,
            }))}
          />
        </aside>
        {children}
      </div>
      <PublicFooter />
    </div>
  );
}
