import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth-context";
import { Layout } from "./components/Layout";
import { Protected } from "./components/Protected";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { Install } from "./pages/Install";
import { Docs } from "./pages/Docs";
import { AuthConnect } from "./pages/AuthConnect";
import { Account } from "./pages/Account";
import { Playground } from "./pages/Playground";
import { Admin } from "./pages/Admin";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="install" element={<Install />} />
            <Route path="docs" element={<Docs />} />
            <Route path="auth" element={<AuthConnect />} />
            <Route path="account" element={<Protected><Account /></Protected>} />
            <Route path="playground" element={<Protected><Playground /></Protected>} />
            <Route path="admin" element={<Protected admin><Admin /></Protected>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
