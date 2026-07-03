import React, { useEffect, useRef } from "react";
import { useGuildOpsController } from "./hooks/useGuildOpsController.js";
import { LandingPage } from "./components/landing/LandingPage.jsx";
import { PublicGuildGallery } from "./components/landing/PublicGuildGallery.jsx";
import {
  AuthGate,
  AuthLoading,
  DataError,
  DataLoading,
  GuildOnboarding,
  JoinGuildRoute,
  MobileBottomNav,
  MobileHeader,
  PublicGuildRoute,
  Sidebar,
  TopBar,
  VerifyEmailRoute,
  ViewRouter,
} from "./components/GuildOpsViews.jsx";

function App() {
  const controller = useGuildOpsController();
  const { activeGuilds, activeView, authSession, guildOpsState, inviteRouteSlug, publicRouteSlug, routePath } = controller;
  const workspaceRef = useRef(null);

  useEffect(() => {
    workspaceRef.current?.scrollTo({ top: 0, left: 0 });
    window.scrollTo({ top: 0, left: 0 });
  }, [activeView]);

  if (publicRouteSlug) {
    return <PublicGuildRoute {...controller.publicRouteProps} />;
  }

  if (inviteRouteSlug) {
    return <JoinGuildRoute {...controller.joinRouteProps} />;
  }

  if (routePath === "/guildes" || routePath === "/galerie") {
    return <PublicGuildGallery onNavigate={controller.publicRouteProps.onNavigatePublicRoute} />;
  }

  if (routePath === "/" || routePath === "/landing") {
    return <LandingPage {...controller.landingProps} />;
  }

  if (routePath === "/auth/verify-email") {
    return (
      <VerifyEmailRoute
        authSession={authSession}
        onBackToLogin={() => controller.onNavigatePath("/app")}
        onVerified={() => controller.onNavigatePath("/app")}
      />
    );
  }

  if (routePath === "/auth/login" || routePath === "/auth/register") {
    if (authSession.isLoading) {
      return <AuthLoading />;
    }

    return <AuthGate authSession={authSession} initialMode={routePath === "/auth/register" ? "register" : "login"} />;
  }

  if (authSession.isLoading) {
    return <AuthLoading />;
  }

  if (authSession.requiresAuth || authSession.status === "error") {
    return <AuthGate authSession={authSession} />;
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && guildOpsState.isLoading) {
    return <DataLoading />;
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && guildOpsState.status === "error") {
    return <DataError error={guildOpsState.error} onLogout={authSession.logout} onRetry={() => guildOpsState.reload()} />;
  }

  if (authSession.isApiEnabled && authSession.isAuthenticated && activeGuilds.length === 0) {
    return <GuildOnboarding {...controller.onboardingProps} />;
  }

  return (
    <div className="app-shell">
      <Sidebar {...controller.sidebarProps} />
      <main className="workspace" ref={workspaceRef}>
        <MobileHeader {...controller.mobileHeaderProps} />
        <TopBar {...controller.topBarProps} />
        <ViewRouter {...controller.viewRouterProps} />
      </main>
      <MobileBottomNav {...controller.mobileBottomNavProps} />
    </div>
  );
}

export default App;
