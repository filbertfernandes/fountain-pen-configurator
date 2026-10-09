import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, useLocation, ScrollRestoration } from 'react-router'
import { Nav, Footer } from '@/ui/Nav'
import { CartDrawer } from '@/ui/CartDrawer'
import Home from '@/pages/Home'
import NotFound from '@/pages/NotFound'

const Configure = lazy(() => import('@/pages/Configure'))
const Checkout = lazy(() => import('@/pages/Checkout'))
const OrderConfirmed = lazy(() => import('@/pages/OrderConfirmed'))

function Layout() {
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const isConfigure = pathname.startsWith('/configure')
  useEffect(() => {
    document.body.dataset.route = isHome ? 'home' : isConfigure ? 'configure' : 'page'
  }, [isHome, isConfigure])
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Nav overlay={isHome} />
      <main id="main">
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>
      {!isConfigure && <Footer />}
      <CartDrawer />
      <ScrollRestoration />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/configure', element: <Configure /> },
      { path: '/checkout', element: <Checkout /> },
      { path: '/order/:number', element: <OrderConfirmed /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
