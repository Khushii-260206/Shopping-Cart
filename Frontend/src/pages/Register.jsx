import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { getErrorMessage } from "../services/api";
import AuthLayout from "../components/AuthLayout";
import Field from "../components/Field";

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
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
      await api.post("/customers/register", formData);
      navigate("/login");
    } catch (err) {
      setError(getErrorMessage(err, "Unable to create your account."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It only takes a moment."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-ink underline">
            Log in
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
          id="fullName"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          value={formData.fullName}
          onChange={handleChange}
          placeholder="Your full name"
        />

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
          autoComplete="new-password"
          required
          minLength={6}
          value={formData.password}
          onChange={handleChange}
          placeholder="At least 6 characters"
          hint="Use at least 6 characters."
        />

        <Field
          id="phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          required
          value={formData.phone}
          onChange={handleChange}
          placeholder="10-digit mobile number"
        />

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary btn-lg w-full"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default Register;
