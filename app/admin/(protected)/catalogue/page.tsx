import { getFullAdminTree } from "@/lib/firestore/catalogue.admin";
import CatalogueTree from "@/components/admin/CatalogueTree";

export const metadata = {
  title: "Catalogue Management - Taleem Admin",
};

export default async function AdminCataloguePage() {
  const tree = await getFullAdminTree();

  return (
    <div className="max-w-7xl mx-auto">
      <CatalogueTree initialTree={tree} />
    </div>
  );
}
