# =====================================================================
# resourcequota.tf — reemplaza templates/resourcequota.yaml del chart.
# Una cuota por namespace, con los mismos valores que ya se validaron
# en la P7 (values-kind.yaml).
# =====================================================================

resource "kubernetes_resource_quota" "cuota" {
  for_each = kubernetes_namespace.ambiente

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
