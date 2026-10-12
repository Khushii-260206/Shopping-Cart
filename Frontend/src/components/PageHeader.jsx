function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="gradient-banner mb-8 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-line px-6 py-7 sm:px-8">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export default PageHeader;
