import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

interface DeadlineAlertEmailProps {
  activityTitle: string;
  projectName: string;
  dueDate: string;
  kind: "overdue" | "upcoming";
}

export function DeadlineAlertEmail({
  activityTitle,
  projectName,
  dueDate,
  kind,
}: DeadlineAlertEmailProps) {
  const heading = kind === "overdue" ? "Atividade atrasada" : "Prazo se aproximando";
  const preview =
    kind === "overdue"
      ? `A atividade "${activityTitle}" está atrasada`
      : `A atividade "${activityTitle}" vence em breve`;

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#0D0F12", color: "#e5e7eb" }}>
        <Container style={{ padding: "24px" }}>
          <Heading style={{ fontSize: "18px" }}>{heading}</Heading>
          <Text>
            Atividade: <strong>{activityTitle}</strong>
          </Text>
          <Text>Projeto: {projectName}</Text>
          <Text>Prazo: {dueDate}</Text>
        </Container>
      </Body>
    </Html>
  );
}
