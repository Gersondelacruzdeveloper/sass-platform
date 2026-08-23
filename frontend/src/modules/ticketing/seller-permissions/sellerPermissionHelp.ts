// src/modules/ticketing/seller-permissions/sellerPermissionHelp.ts

export type SellerPermissionRisk = "bajo" | "medio" | "alto" | "crítico";

export type SellerPermissionHelp = {
  title: string;
  summary: string;
  example: string;
  disabledResult: string;
  limitations: string;
  risk: SellerPermissionRisk;
  riskReason: string;
};

export const sellerPermissionHelp: Record<string, SellerPermissionHelp> = {
  can_access_dashboard: {
    title: "Acceder al panel del vendedor",
    summary:
      "Permite que el vendedor entre al portal privado de vendedores y utilice las funciones que además tenga autorizadas.",
    example:
      "Ejemplo real: Ana inicia sesión desde su teléfono para revisar sus ventas y crear una nueva reserva. Sin este permiso, aunque tenga usuario y contraseña, no debe poder entrar al panel del vendedor.",
    disabledResult:
      "El vendedor no debe tener acceso al dashboard del vendedor. Tener otros permisos activados no sustituye este acceso principal.",
    limitations:
      "Este permiso abre la puerta al portal, pero no concede automáticamente permisos para vender, cobrar, cancelar, administrar productos o ver reportes.",
    risk: "medio",
    riskReason:
      "Da acceso al área privada del vendedor, aunque las acciones internas siguen dependiendo de otros permisos.",
  },

  can_sell_cocobongo: {
    title: "Vender Coco Bongo / Wellet",
    summary:
      "Permite utilizar el flujo de productos de Coco Bongo o de la integración Wellet cuando esa integración está habilitada para la organización.",
    example:
      "Ejemplo real: Luis recibe una solicitud para dos entradas de Coco Bongo. Si la integración Wellet está activa y Luis tiene este permiso, puede utilizar ese flujo de venta.",
    disabledResult:
      "El vendedor no debe poder utilizar la integración de Coco Bongo/Wellet por este permiso.",
    limitations:
      "La integración también debe estar habilitada a nivel de la organización. Un administrador o un usuario con permiso de gestionar integraciones puede tener acceso por otra vía administrativa.",
    risk: "medio",
    riskReason:
      "Permite crear ventas mediante una integración externa y puede involucrar disponibilidad y precios de un proveedor.",
  },

  can_sell_excursions: {
    title: "Vender excursiones",
    summary:
      "Autoriza al vendedor a trabajar con productos clasificados como excursiones dentro de su acceso de ventas.",
    example:
      "Ejemplo real: una familia de cuatro personas quiere reservar Isla Saona. María puede seleccionar la excursión y continuar con la venta si también tiene acceso al producto y permiso para crear reservas.",
    disabledResult:
      "El vendedor no debe poder utilizar el flujo de venta de excursiones, aunque conozca el enlace o el identificador del producto.",
    limitations:
      "No significa que pueda vender todas las excursiones. La disponibilidad del producto, su estado y cualquier asignación específica siguen aplicando.",
    risk: "medio",
    riskReason:
      "Permite generar ventas y reservas de una categoría comercial.",
  },

  can_sell_transfers: {
    title: "Vender traslados",
    summary:
      "Autoriza al vendedor a utilizar productos de traslado, como aeropuerto-hotel o hotel-aeropuerto.",
    example:
      "Ejemplo real: un cliente necesita transporte privado desde PUJ hasta su hotel. El vendedor puede preparar la reserva del traslado si el producto está disponible y tiene permiso para crear reservas.",
    disabledResult:
      "El vendedor no debe poder crear ventas de productos clasificados como traslados.",
    limitations:
      "Las rutas, vehículos, disponibilidad, precios y asignaciones del producto siguen controlándose por sus propias reglas.",
    risk: "medio",
    riskReason:
      "Permite comprometer inventario y crear obligaciones operativas de transporte.",
  },

  can_sell_events: {
    title: "Vender eventos",
    summary:
      "Autoriza al vendedor a vender productos clasificados como eventos o entradas de eventos.",
    example:
      "Ejemplo real: un cliente quiere dos entradas para un evento nocturno. El vendedor puede seleccionar el evento disponible y generar la reserva correspondiente.",
    disabledResult:
      "El vendedor no debe poder completar ventas de productos clasificados como eventos.",
    limitations:
      "El evento debe estar activo y disponible. Los tipos de entrada y reglas del producto siguen aplicando.",
    risk: "medio",
    riskReason:
      "Permite vender inventario con fecha y disponibilidad específica.",
  },

  can_sell_custom_tours: {
    title: "Vender tours personalizados",
    summary:
      "Autoriza al vendedor a utilizar el flujo de productos o reservas de tours personalizados.",
    example:
      "Ejemplo real: una familia solicita un tour privado diseñado para ellos. Un vendedor autorizado puede preparar esa venta personalizada si el sistema y el producto lo permiten.",
    disabledResult:
      "El vendedor no debe poder utilizar el flujo protegido de tours personalizados.",
    limitations:
      "No elimina controles de precio, disponibilidad, aprobación o creación de reservas.",
    risk: "medio",
    riskReason:
      "Los tours personalizados pueden implicar precios, servicios y compromisos operativos especiales.",
  },

  can_create_bookings: {
    title: "Crear reservas",
    summary:
      "Permite al vendedor crear nuevas reservas. Es uno de los permisos base para poder convertir una venta en una reserva real.",
    example:
      "Ejemplo real: Pedro confirma con un cliente una excursión para mañana y registra la reserva con los datos del cliente y los pasajeros.",
    disabledResult:
      "El backend debe rechazar la creación de reservas realizada por ese vendedor.",
    limitations:
      "Crear una reserva no concede automáticamente permisos de pago, descuentos, cancelaciones ni venta de todas las categorías de productos.",
    risk: "medio",
    riskReason:
      "Crea registros operativos que afectan disponibilidad, clientes y seguimiento de ventas.",
  },

  can_take_deposits: {
    title: "Aceptar depósitos",
    summary:
      "Permite utilizar un tipo de pago de depósito para registrar una parte del importe de la reserva y dejar un saldo pendiente.",
    example:
      "Ejemplo real: una reserva de Isla Saona cuesta US$320. El cliente paga US$80 para confirmar y quedan US$240 pendientes. Este permiso permite usar el flujo de depósito cuando las demás reglas lo permiten.",
    disabledResult:
      "El backend debe rechazar una operación de pago cuyo tipo sea depósito para ese vendedor.",
    limitations:
      "El vendedor también puede necesitar permiso para crear la reserva. El producto, método de pago y otras reglas financieras pueden limitar la operación.",
    risk: "alto",
    riskReason:
      "Afecta directamente el estado financiero de una reserva y el saldo pendiente del cliente.",
  },

  can_take_full_payments: {
    title: "Aceptar pagos completos",
    summary:
      "Permite registrar o procesar un pago completo o el saldo final de una reserva cuando el flujo de pago lo permite.",
    example:
      "Ejemplo real: una reserva cuesta US$250 y el cliente paga los US$250 al momento de reservar. El vendedor puede utilizar el tipo de pago completo.",
    disabledResult:
      "El backend debe rechazar pagos de tipo completo o saldo realizados bajo el acceso de ese vendedor.",
    limitations:
      "No significa que el vendedor pueda marcar manualmente una reserva como pagada ni que pueda pagar él mismo por el cliente. Esas acciones tienen permisos separados.",
    risk: "alto",
    riskReason:
      "Modifica el estado financiero de la reserva y puede representar dinero recibido.",
  },

  can_collect_cash_payment: {
    title: "Cobrar en efectivo",
    summary:
      "Permite al vendedor utilizar efectivo como método de cobro cuando registra un pago autorizado.",
    example:
      "Ejemplo real: un cliente entrega US$100 en efectivo al vendedor como depósito. Con este permiso, el vendedor puede registrar el cobro en efectivo si también tiene permitido el tipo de pago correspondiente.",
    disabledResult:
      "El backend debe rechazar el método de pago cash para ese vendedor.",
    limitations:
      "Cobrar efectivo no concede automáticamente permiso para depósitos, pagos completos o marcar pagos manualmente. Esos controles se evalúan por separado.",
    risk: "crítico",
    riskReason:
      "El vendedor recibe dinero físico y la empresa puede necesitar conciliación y responsabilidad de caja.",
  },

  can_generate_ticket_without_customer_online_payment: {
    title: "Generar ticket sin pago online del cliente",
    summary:
      "Permite generar el ticket o confirmación sin exigir que el cliente complete primero un pago online.",
    example:
      "Ejemplo real: un cliente paga mediante un método autorizado fuera del checkout online y el vendedor necesita emitir el ticket para la actividad.",
    disabledResult:
      "El vendedor no debe poder saltarse el requisito de pago online mediante esta opción.",
    limitations:
      "No debe interpretarse como permiso para inventar pagos. Los estados financieros, cobros y reglas de emisión del ticket siguen aplicando.",
    risk: "crítico",
    riskReason:
      "Puede permitir emitir acceso o documentación antes de que exista un pago online confirmado.",
  },

  can_mark_customer_deposit_paid: {
    title: "Marcar depósito del cliente como pagado",
    summary:
      "Permite confirmar manualmente que el depósito requerido al cliente ya fue pagado cuando el flujo correspondiente lo admite.",
    example:
      "Ejemplo real: el cliente entrega en efectivo el depósito acordado y el vendedor autorizado registra que ese depósito quedó pagado.",
    disabledResult:
      "El vendedor no debe poder marcar manualmente el depósito del cliente como pagado.",
    limitations:
      "Este permiso no sustituye los permisos para cobrar efectivo, aceptar depósitos o procesar otros tipos de pago.",
    risk: "crítico",
    riskReason:
      "Cambia manualmente el estado de una obligación financiera del cliente.",
  },

  can_mark_customer_full_paid: {
    title: "Marcar al cliente como totalmente pagado",
    summary:
      "Permite confirmar manualmente que el cliente ya pagó el importe completo cuando el flujo protegido lo permite.",
    example:
      "Ejemplo real: el cliente entrega el saldo final directamente a un vendedor autorizado y este confirma que la reserva quedó totalmente pagada.",
    disabledResult:
      "El vendedor no debe poder marcar manualmente una reserva como completamente pagada.",
    limitations:
      "No es lo mismo que aceptar un pago completo a través del flujo normal. Este permiso representa una confirmación manual y debe asignarse con mucho cuidado.",
    risk: "crítico",
    riskReason:
      "Puede cambiar una reserva a estado pagado sin depender de una confirmación online automática.",
  },

  can_pay_full_amount_as_seller: {
    title: "Permitir que el vendedor pague el importe completo",
    summary:
      "Permite utilizar un flujo donde el propio vendedor figura como pagador del importe completo.",
    example:
      "Ejemplo real: el vendedor decide cubrir el importe completo de una reserva para cerrar una operación y después liquidarlo según el proceso interno de la empresa.",
    disabledResult:
      "Si el pagador es el seller y el tipo de pago es full, el backend debe rechazar la operación.",
    limitations:
      "No es igual a aceptar el pago completo de un cliente. Este permiso se aplica específicamente cuando payer_type es seller.",
    risk: "crítico",
    riskReason:
      "Puede crear obligaciones financieras directas entre el vendedor y la empresa.",
  },

  can_pay_deposit_as_seller: {
    title: "Permitir que el vendedor pague el depósito",
    summary:
      "Permite utilizar un flujo donde el vendedor figura como pagador del depósito de una reserva.",
    example:
      "Ejemplo real: para asegurar una plaza urgente, un vendedor autorizado adelanta el depósito y luego gestiona el cobro al cliente según las políticas internas.",
    disabledResult:
      "Si el pagador es el seller y el pago es un depósito, el backend debe rechazar la operación.",
    limitations:
      "No equivale a aceptar un depósito del cliente. Se refiere específicamente a que el vendedor asuma ese pago.",
    risk: "crítico",
    riskReason:
      "Puede generar deuda, adelantos o conciliaciones entre el vendedor y la empresa.",
  },

  can_pay_commission_only: {
    title: "Pagar solo la comisión",
    summary:
      "Permite utilizar el tipo de pago commission_only cuando el flujo financiero de la reserva lo admite.",
    example:
      "Ejemplo real: en una operación configurada para ello, el vendedor entrega únicamente la parte correspondiente a comisión en vez de registrar un pago completo.",
    disabledResult:
      "El backend debe rechazar operaciones cuyo tipo de pago sea commission_only.",
    limitations:
      "La forma exacta de liquidación depende de las reglas financieras y de comisión de la reserva. No reemplaza otros permisos de cobro.",
    risk: "crítico",
    riskReason:
      "Afecta directamente cómo se distribuye y liquida el dinero de una venta.",
  },

  can_create_pending_payment_booking: {
    title: "Crear reserva con pago pendiente",
    summary:
      "Permite crear una reserva que queda pendiente de pago en lugar de exigir que el pago se complete inmediatamente.",
    example:
      "Ejemplo real: una agencia confirma una excursión para mañana pero pagará más tarde según su acuerdo. El vendedor puede crear la reserva como pendiente si está autorizado.",
    disabledResult:
      "El backend debe rechazar el flujo protegido de creación de reservas pendientes de pago.",
    limitations:
      "No elimina la obligación de cobro ni concede permiso para marcar posteriormente el pago como completado.",
    risk: "alto",
    riskReason:
      "Permite confirmar una operación antes de que el dinero haya sido recibido.",
  },

  can_request_supervisor_approval: {
    title: "Solicitar aprobación de un supervisor",
    summary:
      "Permite al vendedor enviar una operación al flujo de aprobación de un supervisor cuando una acción requiere revisión.",
    example:
      "Ejemplo real: el vendedor necesita una excepción que no puede aprobar por sí mismo y envía la solicitud a un supervisor para revisión.",
    disabledResult:
      "El vendedor no debe poder iniciar el flujo protegido de solicitud de aprobación.",
    limitations:
      "Solicitar aprobación no significa que la operación esté aprobada. Un usuario autorizado debe revisarla y aceptar o rechazarla.",
    risk: "bajo",
    riskReason:
      "No concede la acción final; permite pedir revisión a una persona con mayor autoridad.",
  },

  can_send_receipt_before_full_payment: {
    title: "Enviar recibo antes del pago completo",
    summary:
      "Permite enviar un recibo o documento de confirmación antes de que la reserva esté completamente pagada, cuando el flujo lo admita.",
    example:
      "Ejemplo real: el cliente pagó un depósito y solicita un recibo inmediatamente, aunque todavía quede saldo pendiente.",
    disabledResult:
      "El vendedor no debe poder usar la función protegida que envía el recibo antes del pago total.",
    limitations:
      "El recibo no debe interpretarse como confirmación de pago total. El saldo pendiente continúa existiendo.",
    risk: "alto",
    riskReason:
      "Un documento enviado demasiado pronto puede confundirse con evidencia de pago completo.",
  },

  can_view_own_sales: {
    title: "Ver sus propias ventas",
    summary:
      "Permite al vendedor consultar las ventas y reservas asociadas a su propio perfil.",
    example:
      "Ejemplo real: al terminar el día, María revisa las seis reservas que ella misma creó para comprobar clientes, fechas y montos.",
    disabledResult:
      "El vendedor no debe tener acceso a la vista protegida de sus propias ventas.",
    limitations:
      "No concede acceso a las ventas de otros vendedores ni a reportes globales de la organización.",
    risk: "bajo",
    riskReason:
      "Es acceso de lectura limitado a información relacionada con el propio vendedor.",
  },

  can_view_own_commissions: {
    title: "Ver sus propias comisiones",
    summary:
      "Permite al vendedor consultar las comisiones generadas por sus propias ventas.",
    example:
      "Ejemplo real: Carlos revisa que tiene US$185 acumulados en comisiones antes de solicitar un pago.",
    disabledResult:
      "El vendedor no debe poder consultar la vista protegida de sus propias comisiones.",
    limitations:
      "No permite cambiar porcentajes ni ver las comisiones de otros vendedores. Además, solicitar un payout requiere este permiso junto con otras condiciones.",
    risk: "bajo",
    riskReason:
      "Expone información financiera del propio vendedor, pero no concede capacidad de modificarla.",
  },

  can_apply_discounts: {
    title: "Aplicar descuentos al cliente",
    summary:
      "Permite aplicar un descuento al cliente dentro del porcentaje máximo autorizado.",
    example:
      "Ejemplo real: una excursión cuesta US$100 y el vendedor tiene un máximo de 10%. Puede ofrecer US$5 o US$10 de descuento, pero no US$20.",
    disabledResult:
      "Si el descuento es mayor que cero, el backend debe rechazarlo cuando el vendedor no tenga este permiso.",
    limitations:
      "El descuento también está limitado por max_customer_discount_percent y cualquier límite adicional del producto. Activar este permiso no significa descuento ilimitado.",
    risk: "alto",
    riskReason:
      "Reduce directamente los ingresos o el margen disponible de una venta.",
  },

  can_cancel_bookings: {
    title: "Cancelar reservas",
    summary:
      "Permite al vendedor ejecutar acciones protegidas de cancelación de reservas.",
    example:
      "Ejemplo real: un cliente cancela antes de la excursión y un vendedor autorizado registra la cancelación siguiendo la política de la empresa.",
    disabledResult:
      "El backend debe rechazar la operación protegida de cancelación para ese vendedor.",
    limitations:
      "Cancelar no significa necesariamente reembolsar dinero. Los reembolsos y otras consecuencias financieras pueden tener procesos separados.",
    risk: "alto",
    riskReason:
      "Puede afectar operaciones, disponibilidad, proveedores y posibles obligaciones de reembolso.",
  },

  can_send_whatsapp: {
    title: "Enviar WhatsApp",
    summary:
      "Permite utilizar las funciones protegidas de comunicación por WhatsApp disponibles para vendedores.",
    example:
      "Ejemplo real: después de crear una reserva, el vendedor envía al cliente la confirmación o información de recogida por WhatsApp.",
    disabledResult:
      "El vendedor no debe poder utilizar las acciones protegidas de envío por WhatsApp.",
    limitations:
      "La integración y configuración de WhatsApp de la organización deben estar disponibles. Este permiso no permite administrar la integración.",
    risk: "medio",
    riskReason:
      "Permite comunicarse externamente con clientes en nombre de la empresa.",
  },

  can_send_email: {
    title: "Enviar correo electrónico",
    summary:
      "Permite utilizar las funciones protegidas de envío de correos a clientes desde el sistema.",
    example:
      "Ejemplo real: el vendedor envía por email la confirmación de una reserva y las instrucciones para el cliente.",
    disabledResult:
      "El vendedor no debe poder utilizar las acciones protegidas de envío de email.",
    limitations:
      "La configuración de correo de la organización debe funcionar. El permiso no autoriza al vendedor a cambiar credenciales o proveedores de email.",
    risk: "medio",
    riskReason:
      "Permite comunicación externa con clientes usando la identidad de la empresa.",
  },

  can_send_payment_links: {
    title: "Generar enlaces de pago para clientes",
    summary:
      "Permite crear o enviar enlaces/ofertas que el cliente puede usar para continuar con un pago.",
    example:
      "Ejemplo real: un cliente confirma por WhatsApp que quiere reservar. El vendedor genera un enlace de pago y se lo envía para que complete el depósito online.",
    disabledResult:
      "El vendedor no debe poder utilizar la función protegida de generación de enlaces de pago.",
    limitations:
      "Generar el enlace no confirma que el cliente haya pagado. La confirmación del proveedor de pagos sigue siendo necesaria.",
    risk: "alto",
    riskReason:
      "Inicia un flujo financiero que el cliente puede utilizar para pagar a la empresa.",
  },

  can_override_pickup_time: {
    title: "Cambiar manualmente la hora de recogida",
    summary:
      "Permite reemplazar la hora de pickup calculada o configurada cuando el flujo de la reserva lo admite.",
    example:
      "Ejemplo real: por una coordinación especial con el proveedor, el cliente debe ser recogido a las 7:10 a. m. en vez de las 7:30 a. m. Un vendedor autorizado puede registrar esa excepción.",
    disabledResult:
      "El backend debe rechazar la acción protegida de override de pickup time.",
    limitations:
      "Debe utilizarse solo cuando exista confirmación operativa. Cambiar la hora no modifica automáticamente acuerdos externos con proveedores.",
    risk: "alto",
    riskReason:
      "Una hora incorrecta puede provocar no-show, reclamaciones o fallos operativos.",
  },

  can_view_reports: {
    title: "Ver reportes",
    summary:
      "Permite acceder a reportes de Ticketing protegidos para usuarios que no sean administradores de la organización.",
    example:
      "Ejemplo real: un supervisor revisa las ventas y resultados del equipo durante la semana para preparar el cierre operativo.",
    disabledResult:
      "El vendedor no debe poder acceder a endpoints o pantallas protegidas por el permiso de reportes.",
    limitations:
      "El alcance exacto depende del reporte. No concede automáticamente permisos para modificar ventas, productos o vendedores.",
    risk: "alto",
    riskReason:
      "Puede exponer información financiera y operativa más amplia que las ventas propias del vendedor.",
  },

  can_manage_products: {
    title: "Administrar productos",
    summary:
      "Permite realizar acciones administrativas protegidas sobre productos de Ticketing.",
    example:
      "Ejemplo real: un manager autorizado actualiza una excursión, disponibilidad comercial o información de producto desde el panel de administración.",
    disabledResult:
      "Un seller que no sea administrador de la organización no debe pasar las acciones protegidas por CanManageTicketingProducts.",
    limitations:
      "Es un permiso administrativo. No debe darse a un vendedor que solo necesita vender productos existentes.",
    risk: "crítico",
    riskReason:
      "Los cambios de producto pueden afectar precios, inventario, contenido público y ventas de toda la organización.",
  },

  can_manage_sellers: {
    title: "Administrar vendedores",
    summary:
      "Permite realizar acciones administrativas protegidas sobre vendedores de la misma organización.",
    example:
      "Ejemplo real: un manager crea o actualiza perfiles de vendedores, revisa accesos y ajusta permisos de su equipo.",
    disabledResult:
      "Un seller que no sea administrador de la organización no debe pasar las acciones protegidas por CanManageTicketingSellers.",
    limitations:
      "Debe permanecer limitado al tenant actual. No autoriza a administrar vendedores de otra organización.",
    risk: "crítico",
    riskReason:
      "Puede permitir otorgar, retirar o modificar accesos de otras personas.",
  },

  can_manage_settings: {
    title: "Administrar configuración",
    summary:
      "Permite acceder a funciones administrativas de configuración de Ticketing que estén protegidas por este permiso.",
    example:
      "Ejemplo real: un manager de confianza modifica una configuración operativa de Ticketing sin necesitar acceso de owner completo.",
    disabledResult:
      "El vendedor no debe poder ejecutar acciones protegidas que requieran administrar settings.",
    limitations:
      "La configuración concreta puede tener controles adicionales. Este permiso debe reservarse para usuarios de mucha confianza.",
    risk: "crítico",
    riskReason:
      "Los cambios de configuración pueden afectar el comportamiento global del sistema para toda la organización.",
  },

  can_manage_integrations: {
    title: "Administrar integraciones",
    summary:
      "Permite acceder a funciones protegidas relacionadas con integraciones externas. También puede dar acceso administrativo a determinadas integraciones como Wellet.",
    example:
      "Ejemplo real: un manager técnico revisa o administra una integración utilizada por la empresa para vender productos externos.",
    disabledResult:
      "El vendedor no debe tener acceso administrativo a integraciones por este permiso.",
    limitations:
      "Las integraciones pueden requerir configuración adicional a nivel de organización. No debe usarse como sustituto de permisos de venta normales.",
    risk: "crítico",
    riskReason:
      "Las integraciones pueden afectar proveedores externos, credenciales, disponibilidad, cobros y operaciones de toda la organización.",
  },
};

export function getSellerPermissionHelp(
  permissionKey: string,
): SellerPermissionHelp | null {
  return sellerPermissionHelp[permissionKey] || null;
}
