import React, {
  useEffect,
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
  Maximize2,
  Package,
  Palette,
  ShoppingBag,
  Smile,
  Sparkles,
  Swords,
  Terminal,
  Unlock,
  X
} from "lucide-react";
import {
  PanelHeader
} from "../shared/Shared.jsx";
import {
  GuildSitePreview
} from "../command/CommandViews.jsx";
import {
  createGuildSiteDraft,
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
  { id: "cmd-1042", guildName: "NorthForge", product: "Emojis Officiers", amount: 9, status: "Livré" },
  { id: "cmd-1041", guildName: "RavenHold", product: "Template War Room", amount: 29, status: "Livré" },
  { id: "cmd-1040", guildName: "Snow Pact", product: "Pack images Camp Nord", amount: 19, status: "En cours" },
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

const SHOP_TEMPLATE_PREVIEWS = Object.freeze({
  "raid-board": {
    guildName: "Aegis Nord",
    game: "Whiteout Survival",
    realm: "S1287",
    tagline: "Rallyes, timers et consignes au même endroit.",
    objective: "Calendrier war, appels d'action visibles et modules en timeline pour coordonner les départs.",
    objectiveTag: "Operations",
    theme: "war-room",
    design: "raid-board",
    colors: "rose",
    typography: "orbitron",
  },
  "alliance-atlas": {
    guildName: "Atlas Pact",
    game: "Whiteout Survival",
    realm: "K321",
    tagline: "Carte diplomatique, alliés et zones sensibles.",
    objective: "Montrer les NAP, les contacts royaume et les priorites diplomatiques sans brouiller la lecture.",
    objectiveTag: "Diplomatie",
    theme: "royal-banner",
    design: "alliance-atlas",
    colors: "slate",
    typography: "inter",
  },
  "forge-terminal": {
    guildName: "Forge R5",
    game: "Whiteout Survival",
    realm: "S940",
    tagline: "Banque, logs et demandes en mode command center.",
    objective: "Centraliser ressources, ordres rapides et suivi des contributions pour les officiers.",
    objectiveTag: "Operations",
    theme: "camp-nord",
    design: "forge-terminal",
    colors: "lime",
    typography: "orbitron",
  },
  "citadel-luxe": {
    guildName: "Citadel Crown",
    game: "Whiteout Survival",
    realm: "K88",
    tagline: "Vitrine premium pour guilde sélective.",
    objective: "Inspirer confiance avec une page sombre, lisible et prestige.",
    objectiveTag: "Competitif",
    theme: "royal-banner",
    design: "citadel-luxe",
    colors: "rose",
    typography: "inter",
  },
});

const SHOP_PREVIEW_SECTIONS = Object.freeze({
  roster: true,
  wars: true,
  bank: true,
  diplomacy: true,
  forum: true,
  publicChat: false,
});

const SHOP_PREVIEW_EVENTS = Object.freeze({
  nextEvent: {
    id: "shop-preview-war",
    title: "Rally Forteresse",
    eventType: "war",
    time: "20:00 UTC",
    realm: "S1287",
    status: "live",
  },
  events: [
    {
      id: "shop-preview-bear",
      title: "Bear Hunt",
      eventType: "event",
      time: "21:30 UTC",
      realm: "S1287",
      status: "planned",
    },
    {
      id: "shop-preview-svs",
      title: "Prep SvS",
      eventType: "war",
      time: "Demain",
      realm: "S1287",
      status: "planned",
    },
  ],
  weeklyObjectives: {
    total: 4,
    done: 2,
    completionRate: 0.5,
    objectives: [
      { id: "shop-preview-objective-1", title: "R4 assignes", status: "done" },
      { id: "shop-preview-objective-2", title: "Timers annonces", status: "done" },
      { id: "shop-preview-objective-3", title: "Rally leads", status: "in_progress" },
    ],
  },
});

const SHOP_ASSET_PREVIEWS = Object.freeze({
  "nord-image-pack": {
    kind: "images",
    title: "Camp Nord",
    subtitle: "Hero, bannières, annonces",
    tiles: ["Hero givré", "War banner", "Accès membres", "Fond forum"],
    rows: ["24 PNG haute résolution", "Formats site et Discord", "Variantes sombres incluses"],
  },
  "emoji-officers": {
    kind: "emojis",
    title: "Emojis Officiers",
    subtitle: "Rôles, alertes, ressources",
    tiles: ["R5", "R4", "WAR", "NAP", "RSS", "OK"],
    rows: ["36 PNG prêts Discord", "Badges commandement", "Réactions diplomatie et banque"],
  },
  "launch-bundle": {
    kind: "bundle",
    title: "Bundle lancement",
    subtitle: "Template + images + emojis",
    tiles: ["Site", "Hero", "Icons", "Emoji"],
    rows: ["1 template premium", "24 images de guilde", "36 emojis officiers"],
  },
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
  const [expandedPreviewProductId, setExpandedPreviewProductId] = useState("");
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
  const expandedPreviewProduct = SHOP_PRODUCTS.find((product) => product.id === expandedPreviewProductId) || null;
  const minimumPrice = Math.min(...SHOP_PRODUCTS.map((product) => product.price));
  const selectedTemplatePurchased = selectedProduct.designId ? purchasedDesignSet.has(selectedProduct.designId) : false;
  const selectedProductIcon = selectedProduct.designId ? getTemplateIcon(selectedProduct) : getProductIcon(selectedProduct.type);
  const expandedPreviewIcon = expandedPreviewProduct?.designId
    ? getTemplateIcon(expandedPreviewProduct)
    : getProductIcon(expandedPreviewProduct?.type);

  function handlePrimaryAction() {
    if (!selectedProduct.designId) return;

    if (selectedTemplatePurchased) {
      onUseTemplate?.(selectedProduct.designId);
      return;
    }

    onPurchaseTemplate?.(selectedProduct.designId);
  }

  function configureFirstOffer() {
    const firstTemplate = SHOP_PRODUCTS.find((product) => product.designId && product.status === "Actif") || SHOP_PRODUCTS[0];

    setActiveCategory(firstTemplate.type);
    setSelectedProductId(firstTemplate.id);
    window.requestAnimationFrame(() => {
      document.querySelector(".shop-editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
    <div className="page-grid shop-page">
      <section className="panel wide-panel shop-hero-panel">
        <PanelHeader icon={ShoppingBag} title="Offres premium" meta={`${activeCount}/${SHOP_PRODUCTS.length} offres disponibles`} />
        <div className="shop-hero-grid">
          <div className="shop-hero-copy">
            <span>Templates premium, images, emojis</span>
            <h2>Donne à ta guilde un look qui donne envie de la rejoindre.</h2>
            <p>Tes templates, images et emojis se déverrouillent dans le builder et restent disponibles dans tes propositions de design.</p>
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
          <div className={`shop-payment-state ${purchasedDesignIds.length ? "" : "is-empty"}`.trim()}>
            <CreditCard size={22} />
            {purchasedDesignIds.length ? (
              <>
                <span>
                  Déverrouillage builder
                  <strong>{purchasedDesignIds.length} template{purchasedDesignIds.length > 1 ? "s" : ""} disponible{purchasedDesignIds.length > 1 ? "s" : ""}</strong>
                </span>
                <small>Choisis un template premium, déverrouille-le, puis applique-le directement dans ton builder.</small>
              </>
            ) : (
              <>
                <span>
                  Aucune offre configurée
                  <strong>La boutique est prête à démarrer</strong>
                </span>
                <small>C'est normal pour une nouvelle guilde: aucun template ou pack n'a encore été choisi. Configure une première offre pour l'ajouter au builder.</small>
                <button className="primary-action empty-card-action" type="button" onClick={configureFirstOffer}>
                  <ShoppingBag size={16} />
                  Configurer une offre
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="panel shop-products-panel">
        <PanelHeader icon={Package} title="Catalogue" meta={`${filteredProducts.length} offres`} />
        <div className="shop-metrics" aria-label="Repères catalogue">
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
          <strong className="shop-selected-title">{selectedProduct.name}</strong>
          <small className="shop-selected-description">{selectedProduct.description}</small>
          <ShopOfferPreview
            icon={selectedProductIcon}
            onExpand={() => setExpandedPreviewProductId(selectedProduct.id)}
            product={selectedProduct}
          />
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
              {selectedTemplatePurchased ? "Utiliser dans le builder" : "Déverrouiller ce template"}
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
        <PanelHeader icon={CreditCard} title="Déjà adopté" meta="Exemples récents" />
        <div className="shop-order-list">
          {SHOP_ORDERS.map((order) => (
            <article key={order.id}>
              <span>
                <strong>{order.guildName}</strong>
                <small>{order.product}</small>
              </span>
              <em>{formatPrice(order.amount)}</em>
              <i>{order.status}</i>
            </article>
          ))}
        </div>
      </section>
    </div>
    {expandedPreviewProduct ? (
      <ShopPreviewModal
        icon={expandedPreviewIcon}
        onClose={() => setExpandedPreviewProductId("")}
        product={expandedPreviewProduct}
      />
    ) : null}
    </>
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
        <small>Utilisé par {product.sales} guildes</small>
      </span>
      <em>
        {purchased ? <CheckCircle2 size={13} /> : null}
        {purchased ? "Déverrouillé" : product.status}
      </em>
    </button>
  );
}

function ShopOfferPreview({ expanded = false, icon, onExpand, product }) {
  if (product.designId) {
    return <ShopTemplatePreview expanded={expanded} onExpand={onExpand} product={product} />;
  }

  return <ShopAssetPreview expanded={expanded} icon={icon} onExpand={onExpand} product={product} />;
}

function ShopTemplatePreview({ expanded = false, onExpand, product }) {
  const previewDraft = useMemo(() => {
    const preview = SHOP_TEMPLATE_PREVIEWS[product.designId] || SHOP_TEMPLATE_PREVIEWS["raid-board"];

    return createGuildSiteDraft(
      {},
      {
        ...preview,
        sections: SHOP_PREVIEW_SECTIONS,
        publicEvents: SHOP_PREVIEW_EVENTS,
        slug: `${preview.guildName}-${preview.realm}`,
      },
    );
  }, [product.designId]);

  return (
    <div
      aria-label={`Aperçu réel du ${product.name}`}
      className={`shop-offer-preview shop-template-window ${expanded ? "is-expanded" : ""} ${onExpand ? "is-clickable" : ""}`.trim()}
    >
      <div aria-hidden="true" className="shop-template-scaler" inert={true}>
        <GuildSitePreview heroTitleTag="h2" members={[]} siteDraft={previewDraft} />
      </div>
      {onExpand ? <ShopPreviewOpenButton product={product} onExpand={onExpand} /> : null}
    </div>
  );
}

function ShopAssetPreview({ expanded = false, icon, onExpand, product }) {
  const ProductIcon = icon || getProductIcon(product.type);
  const preview = SHOP_ASSET_PREVIEWS[product.id] || SHOP_ASSET_PREVIEWS["launch-bundle"];

  return (
    <div
      className={`shop-offer-preview shop-asset-preview preview-${preview.kind} ${expanded ? "is-expanded" : ""} ${onExpand ? "is-clickable" : ""}`.trim()}
      aria-label={`Aperçu de ${product.name}`}
    >
      <header>
        <span>
          <ProductIcon size={18} />
        </span>
        <strong>{preview.title}</strong>
        <small>{preview.subtitle}</small>
      </header>
      <div className="shop-asset-grid" aria-hidden="true">
        {preview.tiles.map((tile) => (
          <span key={tile}>{tile}</span>
        ))}
      </div>
      <ul>
        {preview.rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
      {onExpand ? <ShopPreviewOpenButton product={product} onExpand={onExpand} /> : null}
    </div>
  );
}

function ShopPreviewOpenButton({ onExpand, product }) {
  return (
    <button
      aria-label={`Agrandir l'aperçu de ${product.name}`}
      className="shop-preview-open-button"
      onClick={onExpand}
      title="Agrandir l'aperçu"
      type="button"
    >
      <span aria-hidden="true" className="shop-preview-zoom-hint">
        <Maximize2 size={15} />
      </span>
    </button>
  );
}

function ShopPreviewModal({ icon, onClose, product }) {
  const ProductIcon = icon || getProductIcon(product.type);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="shop-preview-modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-label={`Aperçu agrandi de ${product.name}`}
        aria-modal="true"
        className={`shop-preview-modal accent-${product.accent} tone-${product.designTone || "asset"}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="shop-preview-modal-header">
          <span className="shop-product-icon">
            <ProductIcon size={22} />
          </span>
          <span>
            <strong>{product.name}</strong>
            <small>{product.description}</small>
          </span>
          <button aria-label="Fermer l'aperçu" className="shop-preview-modal-close" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </header>
        <div className="shop-preview-modal-body">
          <ShopOfferPreview expanded icon={ProductIcon} product={product} />
        </div>
      </section>
    </div>
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
