# =====================================================================
# namespaces.tf — reemplaza templates/namespace.yaml del chart de la
# P5. Antes lo creaba el propio chart de Helm (requisito de esa
# practica); ahora, por requisito de la P8, sale del chart y se
# declara aqui: "el namespace, las quotas, los limit ranges y el RBAC
# salen del chart y se reescriben como recursos kubernetes_* de
# Terraform" (aclaracion del auxiliar en el foro).
# =====================================================================

resource "kubernetes_namespace" "ambiente" {
  for_each = toset(var.ambientes)

  metadata {
    name = each.value

    labels = {
      "app.kubernetes.io/part-of"   = "sa-platform"
      "app.kubernetes.io/managed-by" = "terraform"
      "sa-platform/ambiente"         = each.value
    }
  }
}
