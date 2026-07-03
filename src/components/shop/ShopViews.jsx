import React, {
  useMemo,
  useState
} from "react";
import {
  CheckCircle2,
  Castle,
  CreditCard,
  Download,
  FileArchive,
  Image as ImageIcon,
  Map,
  Package,
  Palette,
  ShoppingBag,
  Smile,
  Sparkles,
  Swords,
  Terminal,
  Unlock
} from "lucide-react";
import {
  PanelHeader
} from "../shared/Shared.jsx";
import {
  getPremiumDesignOptions
} from "../../lib/guildSiteStore.js";

const SHOP_CATEGORIES = Object.freeze([
  { id: "all", label: "Tous" },
  { id: "template", label: "Templates" },
  { id: "images", label: "Images" },
  { id: "emojis", label: "Emojis" },
  { id: "bundle", label: "Bundles" },
]);

const PREMIUM_TEMPLATE_PRODUCTS = Object.freeze(
  getPremiumDesignOptions().map((design) => ({
    id: design.productId,
    name: `Template ${design.label}`,
    type: "template",
    typeLabel: "Template builder",
    price: design.price,
    sales: design.sales,
    status: "Actif",
    files: design.files,
    delivery: design.delivery,
    license: design.license,
    description: design.shopDescription,
    accent: design.accent,
    designId: design.id,
    designTone: design.tone,
  })),
);

const SHOP_PRODUCTS = Object.freeze([
  ...PREMIUM_TEMPLATE_PRODUCTS,
  {
    id: "nord-image-pack",
    name: "Pack images Camp Nord",
    type: "images",
    typeLabel: "Pack images",
    price: 19,
    sales: 18,
    status: "Actif",
    files: 24,
    delivery: "PNG haute résolution",
    license: "Usage contenu",
    description: "Bannières, fonds de section et vignettes pour annonces de guilde.",
    accent: "blue",
  },
  {
    id: "emoji-officers",
    name: "Emojis Officiers",
    type: "emojis",
    typeLabel: "Pack emojis",
    price: 9,
    sales: 64,
    status: "Actif",
    files: 36,
    delivery: "PNG + Discord ready",
    license: "Serveur Discord",
    description: "Badges R4/R5, alertes, ressources, diplomatie et réactions rapides.",
    accent: "amber",
  },
  {
    id: "launch-bundle",
    name: "Bundle lancement guilde",
    type: "bundle",
    typeLabel: "Bundle",
    price: 49,
    sales: 0,
    status: "Bientôt",
    files: 68,
    delivery: "Templates + images + emojis",
    license: "Pack complet",
    description: "Kit complet pour ouvrir une vitrine de guilde propre dès le premier jour.",
    accent: "violet",
  },
]);

const SHOP_ORDERS = Object.freeze([
  { id: "cmd-1042", buyer: "NorthForge", product: "Emojis Officiers", amount: 9, status: "Livré" },
  { id: "cmd-1041", buyer: "RavenHold", product: "Template War Room", amount: 29, status: "Livré" },
  { id: "cmd-1040", buyer: "Snow Pact", product: "Pack images Camp Nord", amount: 19, status: "En cours" },
]);

const PRODUCT_ICONS = Object.freeze({
  template: Palette,
  images: ImageIcon,
  emojis: Smile,
  bundle: Package,
});

const TEMPLATE_ICONS = Object.freeze({
  "raid-board": Swords,
  "alliance-atlas": Map,
  "forge-terminal": Terminal,
  "citadel-luxe": Castle,
});

function formatPrice(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function getProductIcon(type) {
  return PRODUCT_ICONS[type] || Package;
}

function getTemplateIcon(product) {
  return TEMPLATE_ICONS[product.designId] || FileArchive;
}

export function ShopView({ currentUser, onPurchaseTemplate, onUseTemplate, purchasedDesignIds = [] }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState(SHOP_PRODUCTS[0].id);
  const purchasedDesignSet = useMemo(() => new Set(purchasedDesignIds), [purchasedDesignIds.join("|")]);
  const filteredProducts = useMemo(
    () =>
      activeCategory === "all"
        ? SHOP_PRODUCTS
        : SHOP_PRODUCTS.filter((product) => product.type === activeCategory),
    [activeCategory],
  );
  const selectedProduct = SHOP_PRODUCTS.find((product) => product.id === selectedProductId) || SHOP_PRODUCTS[0];
  const activeCount = SHOP_PRODUCTS.filter((product) => product.status === "Actif").length;
  const minimumPrice = Math.min(...SHOP_PRODUCTS.map((product) => product.price));
  const selectedTemplatePurchased = selectedProduct.designId ? purchasedDesignSet.has(selectedProduct.designId) : false;
  const selectedProductIcon = selectedProduct.designId ? getTemplateIcon(selectedProduct) : getProductIcon(selectedProduct.type);

  function handlePrimaryAction() {
    if (!selectedProduct.designId) return;

    if (selectedTemplatePurchased) {
      onUseTemplate?.(selectedProduct.designId);
      return;
    }

    onPurchaseTemplate?.(selectedProduct.designId);
  }

  return (
    <div className="page-grid shop-page">
      <section className="panel wide-panel shop-hero-panel">
        <PanelHeader icon={ShoppingBag} title="Boutique" meta={`${activeCount}/${SHOP_PRODUCTS.length} offres disponibles`} />
        <div className="shop-hero-grid">
          <div className="shop-hero-copy">
            <span>Templates premium, images, emojis</span>
            <h1>Vends des looks qui donnent envie de rejoindre la guilde.</h1>
            <p>Les templates achetés se déverrouillent dans le builder et deviennent disponibles dans les propositions de design.</p>
            <div className="shop-actions">
              <button className="primary-action" type="button" onClick={() => setActiveCategory("template")}>
                <ShoppingBag size={17} />
                Voir les templates
              </button>
              <button className="ghost-action" type="button">
                <Sparkles size={17} />
                Demander un pack
              </button>
            </div>
          </div>
          <div className="shop-payment-state">
            <CreditCard size={22} />
            <span>
              Achat test
              <strong>{purchasedDesignIds.length} template{purchasedDesignIds.length > 1 ? "s" : ""} déverrouillé{purchasedDesignIds.length > 1 ? "s" : ""}</strong>
            </span>
            <small>Le bouton d'achat simule la commande et ajoute le template au builder pour tester le flux.</small>
          </div>
        </div>
      </section>

      <section className="panel shop-products-panel">
        <PanelHeader icon={Package} title="Catalogue" meta={`${filteredProducts.length} offres`} />
        <div className="shop-metrics" aria-label="Statistiques boutique">
          <ShopMetric label="Offres prêtes" value={String(activeCount)} />
          <ShopMetric label="Prix dès" value={formatPrice(minimumPrice)} />
          <ShopMetric label="Fichiers inclus" value={String(SHOP_PRODUCTS.reduce((total, product) => total + product.files, 0))} />
        </div>
        <div className="shop-filter-tabs" aria-label="Filtrer les produits">
          {SHOP_CATEGORIES.map((category) => (
            <button
              aria-pressed={activeCategory === category.id}
              className={activeCategory === category.id ? "is-active" : ""}
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </div>
        <div className="shop-product-grid">
          {filteredProducts.map((product) => (
            <ShopProductCard
              isSelected={selectedProduct.id === product.id}
              key={product.id}
              onSelect={() => setSelectedProductId(product.id)}
              product={product}
              purchased={product.designId ? purchasedDesignSet.has(product.designId) : false}
            />
          ))}
        </div>
      </section>

      <section className="panel shop-editor-panel">
        <PanelHeader
          icon={selectedProductIcon}
          title="Détail de l'offre"
          meta={selectedTemplatePurchased ? "Déverrouillé" : selectedProduct.status}
        />
        <div className={`shop-selected-product accent-${selectedProduct.accent} tone-${selectedProduct.designTone || "asset"}`}>
          <span className="shop-product-icon">
            {React.createElement(selectedProductIcon, { size: 24 })}
          </span>
          <strong>{selectedProduct.name}</strong>
          <small>{selectedProduct.description}</small>
          {selectedProduct.designTone ? (
            <span className="shop-template-preview" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </div>
        <dl className="shop-product-details">
          <div>
            <dt>Prix</dt>
            <dd>{formatPrice(selectedProduct.price)}</dd>
          </div>
          <div>
            <dt>Livraison</dt>
            <dd>{selectedProduct.delivery}</dd>
          </div>
          <div>
            <dt>Licence</dt>
            <dd>{selectedProduct.license}</dd>
          </div>
          <div>
            <dt>Fichiers</dt>
            <dd>{selectedProduct.files}</dd>
          </div>
        </dl>
        <div className="shop-pipeline">
          <ShopPipelineStep done label="Offre sélectionnée" />
          <ShopPipelineStep done={selectedProduct.status === "Actif"} label="Catalogue" />
          <ShopPipelineStep done={selectedTemplatePurchased} label="Template déverrouillé" />
          <ShopPipelineStep done={selectedTemplatePurchased} label="Disponible builder" />
        </div>
        <div className="shop-editor-actions">
          {selectedProduct.designId ? (
            <button className="primary-action" type="button" onClick={handlePrimaryAction}>
              {selectedTemplatePurchased ? <Unlock size={17} /> : <ShoppingBag size={17} />}
              {selectedTemplatePurchased ? "Utiliser dans le builder" : "Acheter ce template"}
            </button>
          ) : (
            <button className="primary-action" type="button">
              Choisir cette offre
            </button>
          )}
          <button className="ghost-action" type="button">
            <Download size={17} />
            Télécharger un aperçu
          </button>
        </div>
      </section>

      <section className="panel shop-orders-panel">
        <PanelHeader icon={CreditCard} title="Guildes équipées" meta="Derniers achats" />
        <div className="shop-order-list">
          {SHOP_ORDERS.map((order) => (
            <article key={order.id}>
              <span>
                <strong>{order.buyer}</strong>
                <small>{order.product}</small>
              </span>
              <em>{formatPrice(order.amount)}</em>
              <i>{order.status}</i>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function ShopMetric({ label, value }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ShopProductCard({ isSelected, onSelect, product, purchased = false }) {
  const ProductIcon = product.designId ? getTemplateIcon(product) : getProductIcon(product.type);

  return (
    <button
      aria-pressed={isSelected}
      className={`shop-product-card accent-${product.accent} tone-${product.designTone || "asset"} ${isSelected ? "is-selected" : ""} ${purchased ? "is-purchased" : ""}`}
      onClick={onSelect}
      type="button"
    >
      <span className="shop-product-icon">
        <ProductIcon size={22} />
      </span>
      <span className="shop-product-main">
        <strong>{product.name}</strong>
        <small>{product.typeLabel} · {product.files} fichiers</small>
      </span>
      <span className="shop-product-price">
        <strong>{formatPrice(product.price)}</strong>
        <small>{product.sales} guildes</small>
      </span>
      <em>
        {purchased ? <CheckCircle2 size={13} /> : null}
        {purchased ? "Acheté" : product.status}
      </em>
    </button>
  );
}

function ShopPipelineStep({ done = false, label }) {
  return (
    <span className={done ? "is-done" : ""}>
      <i />
      {label}
    </span>
  );
}
