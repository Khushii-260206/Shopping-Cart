import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";
import AuthLayout from "../components/AuthLayout";
import Field from "../components/Field";

function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError("");
      await api.post("customers/login", formData);
      navigate("/home");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to log in. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see your cart, wishlist and orders."
      footer={
        <>
          New to ShopKart?{" "}
          <Link to="/register" className="font-semibold text-ink underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div role="alert" className="alert alert-error">
            {error}
          </div>
        )}

        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={formData.email}
          onChange={handleChange}
          placeholder="you@example.com"
        />

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={formData.password}
          onChange={handleChange}
          placeholder="Your password"
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary btn-lg w-full"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Login;
