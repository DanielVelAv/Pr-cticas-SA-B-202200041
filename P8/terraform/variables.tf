# =====================================================================
# variables.tf — valores por defecto migrados directamente de
# charts/sa-platform/values.yaml y values-kind.yaml de la P5/P7, para
# no inventar cifras nuevas: es la misma configuracion de recursos que
# ya se validó en las practicas anteriores, ahora declarada en
# Terraform en vez de en plantillas de Helm.
# =====================================================================

variable "kubeconfig_path" {
  description = "Ruta al kubeconfig local."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "Contexto de kubectl a usar. kind lo nombra 'kind-<cluster>'."
  type        = string
  default     = "kind-sa-p8"
}

# ---------------------------------------------------------------------
# Ambientes: dos namespaces dentro del MISMO cluster, segun la
# aclaracion del auxiliar en el foro ("basta con dos ambientes, y
# perfectamente pueden ser dos namespaces"). El canary no es un
# ambiente aparte -- ocurre DENTRO de "produccion", como trafico
# dividido entre versiones (lo gestiona Argo Rollouts, no Terraform).
# ---------------------------------------------------------------------
variable "ambientes" {
  description = "Namespaces de la plataforma, uno por ambiente."
  type        = list(string)
  default     = ["sa-p8-staging", "sa-p8-produccion"]
}

# ---------------------------------------------------------------------
# ResourceQuota — mismos valores que values-kind.yaml (P7), pensados
# para un cluster kind local en una laptop de desarrollo, no para un
# proveedor de nube con nodos grandes.
# ---------------------------------------------------------------------
variable "cuota_requests_cpu" {
  type    = string
  default = "1500m"
}

variable "cuota_requests_memory" {
  type    = string
  default = "2Gi"
}

variable "cuota_limits_cpu" {
  type    = string
  default = "3"
}

variable "cuota_limits_memory" {
  type    = string
  default = "3Gi"
}

variable "cuota_pods" {
  type    = string
  default = "20"
}

# ---------------------------------------------------------------------
# LimitRange — mismos valores por defecto que values.yaml (base) de
# la P5: lo que recibe automaticamente cualquier contenedor que no
# declare sus propios recursos.
# ---------------------------------------------------------------------
variable "limite_default_request_cpu" {
  type    = string
  default = "50m"
}

variable "limite_default_request_memory" {
  type    = string
  default = "64Mi"
}

variable "limite_default_limit_cpu" {
  type    = string
  default = "500m"
}

variable "limite_default_limit_memory" {
  type    = string
  default = "512Mi"
}
