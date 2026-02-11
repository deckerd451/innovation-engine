// /assets/js/ui/router.js
import { render } from './dom.js';
import { onboardingPage } from '../pages/onboarding.js';
import { dashboardPage } from '../pages/dashboard.js';

const routes = {
  '/onboarding': onboardingPage,
  '/dashboard' : dashboardPage,
  '/'          : dashboardPage,
};

export function startRouter() {
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const path = (location.hash || '#/').replace('#', '');
  const page = routes[path] || routes['/'];
  const root = document.getElementById('app');
  render(root, page());
}
