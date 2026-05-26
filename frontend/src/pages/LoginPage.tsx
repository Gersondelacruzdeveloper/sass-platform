import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User } from "lucide-react";
import { loginUser } from "../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../store/hooks";

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { loading, error } = useAppSelector(
    (state) => state.auth
  );

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    try {
      await dispatch(
        loginUser({
          login,
          password,
        })
      ).unwrap();

     await new Promise((resolve) => setTimeout(resolve, 300));

      navigate("/dashboard");
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8">
        <div className="mb-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-950 text-white flex items-center justify-center text-2xl font-bold mb-4">
            S
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            Welcome Back
          </h1>

          <p className="text-slate-500">
            Login to your SaaS dashboard
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">
              Username or Email
            </label>

            <div className="mt-1 flex items-center border rounded-xl px-3">
              <User
                size={18}
                className="text-slate-400"
              />

              <input
                type="text"
                className="w-full px-3 py-3 outline-none"
                value={login}
                onChange={(e) =>
                  setLogin(e.target.value)
                }
                placeholder="admin or admin@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700">
              Password
            </label>

            <div className="mt-1 flex items-center border rounded-xl px-3">
              <Lock
                size={18}
                className="text-slate-400"
              />

              <input
                type="password"
                className="w-full px-3 py-3 outline-none"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="********"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full bg-slate-950 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 disabled:opacity-60"
          >
            {loading
              ? "Logging in..."
              : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}