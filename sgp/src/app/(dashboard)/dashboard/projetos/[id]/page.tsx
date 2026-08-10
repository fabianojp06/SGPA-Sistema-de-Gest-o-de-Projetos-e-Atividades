interface ProjetoPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjetoDetailPage({ params }: ProjetoPageProps) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-foreground">Projeto {id}</h1>
    </div>
  );
}
