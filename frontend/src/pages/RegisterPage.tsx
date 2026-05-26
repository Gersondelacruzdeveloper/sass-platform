import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Mail,
  Lock,
  User,
  CreditCard,
} from "lucide-react";

import api from "../api/axios";

export default function RegisterPage() {
  const navigate = useNavigate();

  const [organisationName, setOrganisationName] = useState("");
  const [businessType, setBusinessType] = useState("disco");
  const [plan, setPlan] = useState("pro");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      email,
      username,
      password,
      organisation_name: organisationName,
      business_type: businessType,
      plan,
    };

    console.log("REGISTER PAYLOAD:", payload);

    await api.post("/accounts/register/", payload);

    navigate("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Building2 size={28} />
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            Create Organisation
          </h1>

          <p className="mt-2 text-slate-500">
            Register a business owner and create their organisation.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="text-sm font-semibold text-slate-700">
              Organisation Name
            </label>

            <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
              <Building2 size={18} className="text-slate-400" />

              <input
                value={organisationName}
                onChange={(e) => setOrganisationName(e.target.value)}
                type="text"
                placeholder="Gerson Disco"
                className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                required
              />
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Business Type
              </label>

              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm outline-none"
              >
                <option value="disco">Disco</option>
                <option value="hotel">Hotel</option>
                <option value="restaurant">Restaurant</option>
                <option value="store">Store</option>
                <option value="excursions">Excursions</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">
                Plan
              </label>

              <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
                <CreditCard size={18} className="text-slate-400" />

                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                >
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Username
            </label>

            <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
              <User size={18} className="text-slate-400" />

              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                placeholder="owner"
                className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Email
            </label>

            <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
              <Mail size={18} className="text-slate-400" />

              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="owner@test.com"
                className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-700">
              Password
            </label>

            <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4">
              <Lock size={18} className="text-slate-400" />

              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="password123"
                className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                required
              />
            </div>
          </div>

          <button className="w-full rounded-2xl bg-slate-950 py-4 font-bold text-white transition hover:bg-cyan-600">
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}