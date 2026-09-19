# =====================================================================
# limitrange.tf — reemplaza templates/limitrange.yaml del chart.
# Un LimitRange por namespace: asigna recursos por defecto a
# cualquier contenedor que no los declare explicitamente. Sin esto,
# un pod sin requests/limits es RECHAZADO en cuanto la ResourceQuota
# del namespace esta activa.
# =====================================================================

resource "kubernetes_limit_range" "limites" {
  for_each = kubernetes_namespace.ambiente

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
