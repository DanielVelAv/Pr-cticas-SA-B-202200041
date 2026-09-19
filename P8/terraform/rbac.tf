# =====================================================================
# rbac.tf — RBAC nuevo (no existia en la P5): el chart de Helm nunca
# declaró Role/RoleBinding propios, solo un ServiceAccount por
# microservicio para que cada pod corra con su propia identidad. Ese
# ServiceAccount de aplicación se queda en el chart; lo que se agrega
# aqui es distinto: una cuenta de solo-lectura por ambiente, pensada
# para auditoria/observabilidad (por ejemplo, un dashboard de
# monitoreo o alguien del equipo que necesita revisar el estado del
# namespace sin poder modificar nada) — principio de menor privilegio.
# =====================================================================

resource "kubernetes_service_account" "auditor" {
  for_each = kubernetes_namespace.ambiente

  metadata {
    name      = "sa-platform-auditor"
    namespace = each.value.metadata[0].name
  }
}

resource "kubernetes_role" "solo_lectura" {
  for_each = kubernetes_namespace.ambiente

  metadata {
    name      = "sa-platform-solo-lectura"
    namespace = each.value.metadata[0].name
  }

  # Solo verbos de lectura: get/list/watch. Ningun create/update/delete.
  rule {
    api_groups = [""]
    resources  = ["pods", "services", "configmaps", "endpoints", "events"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["apps"]
    resources  = ["deployments", "replicasets", "statefulsets"]
    verbs      = ["get", "list", "watch"]
  }

  rule {
    api_groups = ["argoproj.io"]
    resources  = ["rollouts", "analysisruns", "analysistemplates"]
    verbs      = ["get", "list", "watch"]
  }
}

resource "kubernetes_role_binding" "solo_lectura" {
  for_each = kubernetes_namespace.ambiente

  metadata {
    name      = "sa-platform-solo-lectura"
    namespace = each.value.metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.solo_lectura[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.auditor[each.key].metadata[0].name
    namespace = each.value.metadata[0].name
  }
}
