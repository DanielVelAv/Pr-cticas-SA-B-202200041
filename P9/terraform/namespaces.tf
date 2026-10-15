# Heredado de P8: namespaces, cuotas, limites y RBAC salen del chart y
# los gestiona Terraform.
resource "kubernetes_namespace_v1" "ambiente" {
  for_each = toset(var.ambientes)

  metadata {
    name = each.value
    labels = {
      "app.kubernetes.io/part-of"    = "sa-platform"
      "app.kubernetes.io/managed-by" = "terraform"
      "sa-platform/ambiente"         = each.value
    }
  }
}

resource "kubernetes_resource_quota_v1" "cuota" {
  for_each = kubernetes_namespace_v1.ambiente

  metadata {
    name      = "sa-platform-cuota"
    namespace = each.value.metadata[0].name
  }
  spec {
    hard = {
      "requests.cpu"    = var.cuota_requests_cpu
      "requests.memory" = var.cuota_requests_memory
      "limits.cpu"      = var.cuota_limits_cpu
      "limits.memory"   = var.cuota_limits_memory
      "pods"            = var.cuota_pods
    }
  }
}

resource "kubernetes_limit_range_v1" "limites" {
  for_each = kubernetes_namespace_v1.ambiente

  metadata {
    name      = "sa-platform-limites"
    namespace = each.value.metadata[0].name
  }
  spec {
    limit {
      type = "Container"
      default_request = {
        cpu    = var.limite_default_request_cpu
        memory = var.limite_default_request_memory
      }
      default = {
        cpu    = var.limite_default_limit_cpu
        memory = var.limite_default_limit_memory
      }
    }
  }
}

# Cuenta de solo lectura por ambiente (auditoria, menor privilegio).
resource "kubernetes_service_account_v1" "auditor" {
  for_each = kubernetes_namespace_v1.ambiente

  metadata {
    name      = "sa-platform-auditor"
    namespace = each.value.metadata[0].name
  }
}

resource "kubernetes_role_v1" "solo_lectura" {
  for_each = kubernetes_namespace_v1.ambiente

  metadata {
    name      = "sa-platform-solo-lectura"
    namespace = each.value.metadata[0].name
  }
  rule {
    api_groups = [""]
    resources  = ["pods", "services", "configmaps", "endpoints", "events", "persistentvolumeclaims"]
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
  rule {
    api_groups = ["policy"]
    resources  = ["poddisruptionbudgets"]
    verbs      = ["get", "list", "watch"]
  }
}

resource "kubernetes_role_binding_v1" "solo_lectura" {
  for_each = kubernetes_namespace_v1.ambiente

  metadata {
    name      = "sa-platform-solo-lectura"
    namespace = each.value.metadata[0].name
  }
  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.solo_lectura[each.key].metadata[0].name
  }
  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account_v1.auditor[each.key].metadata[0].name
    namespace = each.value.metadata[0].name
  }
}
