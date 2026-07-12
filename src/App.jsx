import React, { Suspense, lazy, useEffect, useRef } from "react";
import { useGuildOpsController } from "./hooks/useGuildOpsController.js";

function lazyNamed(importer, exportName) {
  return lazy(() => importer().then((module) => ({ default: module[exportName] })));
}

const LandingPage = lazyNamed(() => import("./components/landing/LandingPage.jsx"), "LandingPage");
const PublicGuildGallery = lazyNamed(() => import("./components/landing/PublicGuildGallery.jsx"), "PublicGuildGallery");
const PublicGuildRoute = lazyNamed(() => import("./components/command/CommandViews.jsx"), "PublicGuildRoute");
const AuthGate = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "AuthGate");
const AuthLoading = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "AuthLoading");
const DataError = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "DataError");
const DataLoading = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "DataLoading");
const GuildOnboarding = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "GuildOnboarding");
const VerifyEmailRoute = lazyNamed(() => import("./components/layout/auth/AuthViews.jsx"), "VerifyEmailRoute");
const JoinGuildRoute = lazyNamed(() => import("./components/layout/join/JoinGuildRoute.jsx"), "JoinGuildRoute");
const Sidebar = lazyNamed(() => import("./components/layout/navigation/LayoutNavigation.jsx"), "Sidebar");
const MobileHeader = lazyNamed(() => import("./components/layout/navigation/LayoutNavigation.jsx"), "MobileHeader");
const TopBar = lazyNamed(() => import("./components/layout/navigation/LayoutNavigation.jsx"), "TopBar");
const MobileBottomNav = lazyNamed(() => import("./components/layout/navigation/LayoutNavigation.jsx"), "MobileBottomNav");
const ViewRouter = lazyNamed(() => import("./components/layout/modules/ModuleViews.jsx"), "ViewRouter");

function RouteFallback() {
  return (
    <main className="auth-shell command-state-shell">
      <section className="auth-panel compact command-state-card">
        <div className="brand-lockup auth-brand">
          <div className="brand-mark" />
          <span>GuildOps</span>
        </div>
        <p>Chargement...</p>
      </section>
    </main>
  );
}

function LazyRoute({ children }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function App() {
  const controller = useGuildOpsController();
  const { activeGuilds, activeView, authSession, guildOpsState, inviteRouteSlug, publicRouteSlug, routePath } = controller;
  const notificationProps = controller.viewRouterProps?.notificationProps || controller.topBarProps?.notificationProps;
  const workspaceRef = useRef(null);

  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  if (publicRouteSlug) {
    return (
      <LazyRoute>
        <PublicGuildRoute {...controller.publicRouteProps} />
      </LazyRoute>
    );
  }

  if (inviteRouteSlug) {
    return (
      <LazyRoute>
        <JoinGuildRoute {...controller.joinRouteProps} />
      </LazyRoute>
    );
  }

  if (routePath === "/guildes" || routePath === "/galerie") {
    return (
      <LazyRoute>
        <PublicGuildGallery onNavigate={controller.publicRouteProps.onNavigatePublicRoute} />
      </LazyRoute>
    );
  }

  if (routePath === "/" || routePath === "/landing") {
    return (
      <LazyRoute>
        <LandingPage {...controller.landingProps} />
      </LazyRoute>
    );
  }

  if (routePath === "/auth/verify-email") {
    return (
      <LazyRoute>
        <VerifyEmailRoute
          authSession={authSession}
          notificationProps={notificationProps}
          onBackToLogin={() => controller.onNavigatePath("/app")}
          onVerified={() => controller.onNavigatePath("/app")}
        />
      </LazyRoute>
    );
  }

  if (routePath === "/auth/login" || routePath === "/auth/register") {
    if (authSession.isLoading) {
      return (
        <LazyRoute>
          <AuthLoading />
        </LazyRoute>
      );
    }

    return (
      <LazyRoute>
        <AuthGate
          authSession={authSession}
          initialMode={routePath === "/auth/register" ? "register" : "login"}
          notificationProps={notificationProps}
          onNavigatePublicPath={controller.onNavigatePath}
        />
      </LazyRoute>
    );
  }

  if (authSession.isLoading) {
    return (
      <LazyRoute>
        <AuthLoading />
      </LazyRoute>
    );
  }

  if (authSession.requiresAuth || authSession.status === "error") {
    return (
      <LazyRoute>
        <AuthGate authSession={authSession} notificationProps={notificationProps} onNavigatePublicPath={controller.onNavigatePath} />
      </LazyRoute>
    );
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && guildOpsState.isLoading) {
    return (
      <LazyRoute>
        <DataLoading />
      </LazyRoute>
    );
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && guildOpsState.status === "error") {
    return (
      <LazyRoute>
        <DataError error={guildOpsState.error} onLogout={authSession.logout} onRetry={() => guildOpsState.reload()} />
      </LazyRoute>
    );
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && activeGuilds.length === 0) {
    return (
      <LazyRoute>
        <GuildOnboarding {...controller.onboardingProps} />
      </LazyRoute>
    );
  }

  return (
    <LazyRoute>
      <div className="app-shell">
        <Sidebar {...controller.sidebarProps} />
        <main className="workspace" ref={workspaceRef}>
          <MobileHeader {...controller.mobileHeaderProps} workspaceRef={workspaceRef} />
          <TopBar {...controller.topBarProps} />
          <ViewRouter {...controller.viewRouterProps} />
        </main>
        <MobileBottomNav {...controller.mobileBottomNavProps} />
      </div>
    </LazyRoute>
  );
}

export default App;
